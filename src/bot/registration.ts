import type { WASocket, proto } from '@whiskeysockets/baileys';
import { loadWeekly, saveWeekly, loadTemplate, saveTemplate } from './state.js';
import { renderTemplate } from './template.js';
import { addPlayerToTemplate, removePlayerFromTemplate } from './admin.js';
import { parseRegistrationMessages } from './claude.js';
import { normalizeJid } from '../utils/helpers.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { CollectedMessage } from '../types.js';

// Track last bot message in Group 2 for delete-before-repost
let lastGroup2MsgKey: proto.IMessageKey | null = null;

export async function sendTemplateToGroup2(sock: WASocket, text: string): Promise<void> {
  // Delete previous bot message
  if (lastGroup2MsgKey) {
    try {
      await sock.sendMessage(config.groupJids.players, { delete: lastGroup2MsgKey });
    } catch (e) {
      logger.debug({ error: e }, 'Could not delete previous Group 2 message');
    }
  }

  const sent = await sock.sendMessage(config.groupJids.players, { text });
  if (sent?.key) {
    lastGroup2MsgKey = sent.key;
  }
}

export async function collectRegistrationMessage(
  senderJid: string,
  text: string,
): Promise<void> {
  const weekly = await loadWeekly();
  weekly.messagesCollected.push({
    senderJid: normalizeJid(senderJid),
    text,
    timestamp: Date.now(),
  });
  await saveWeekly(weekly);
}

// Debounce: collect messages for 15 seconds, then batch process
const DEBOUNCE_MS = 15_000;
let debounceBuffer: CollectedMessage[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let debounceSock: WASocket | null = null;

export function queueImmediateRegistration(
  sock: WASocket,
  senderJid: string,
  text: string,
): void {
  debounceBuffer.push({
    senderJid: normalizeJid(senderJid),
    text,
    timestamp: Date.now(),
  });
  debounceSock = sock;

  // Reset the timer — wait for 15s of quiet before processing
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushDebounceBuffer, DEBOUNCE_MS);
  logger.debug({ bufferSize: debounceBuffer.length }, 'Message queued, processing in 15s');
}

async function flushDebounceBuffer(): Promise<void> {
  if (debounceBuffer.length === 0 || !debounceSock) return;

  const messages = [...debounceBuffer];
  debounceBuffer = [];
  debounceTimer = null;

  logger.info({ count: messages.length }, 'Flushing debounce buffer');
  await processMessages(debounceSock, messages);
}

export async function processBurstRegistrations(sock: WASocket): Promise<void> {
  const weekly = await loadWeekly();
  if (weekly.messagesCollected.length === 0) return;

  const messages = [...weekly.messagesCollected];
  weekly.messagesCollected = [];
  await saveWeekly(weekly);

  await processMessages(sock, messages);
}

export async function processHourlyRefresh(sock: WASocket): Promise<void> {
  const weekly = await loadWeekly();
  if (weekly.messagesCollected.length === 0) return;

  const messages = [...weekly.messagesCollected];
  weekly.messagesCollected = [];
  await saveWeekly(weekly);

  await processMessages(sock, messages);
}

async function processMessages(
  sock: WASocket,
  messages: CollectedMessage[],
): Promise<void> {
  const actions = await parseRegistrationMessages(messages);
  if (actions.length === 0) return;

  const template = await loadTemplate();
  const weekly = await loadWeekly();

  // Dedup: one action per userId
  const seen = new Set<string>();

  for (const action of actions) {
    const normalizedId = normalizeJid(action.userId);
    if (seen.has(normalizedId)) continue;
    seen.add(normalizedId);

    if (action.type === 'register') {
      const name = action.name?.trim();
      if (!name || name.split(/\s+/).length < 2) continue;
      // Skip if already registered by userId
      if (weekly.userIdMap[normalizedId]) continue;
      weekly.userIdMap[normalizedId] = name;
      addPlayerToTemplate(template, {
        name,
        userId: normalizedId,
        isLaundry: false,
        isEquipment: false,
      });
    } else if (action.type === 'cancel') {
      // Always use sender's userId — never trust name from message
      if (!weekly.userIdMap[normalizedId]) continue; // not registered, nothing to cancel
      delete weekly.userIdMap[normalizedId];
      const { promoted } = removePlayerFromTemplate(template, normalizedId);
      if (promoted?.userId) {
        await sock.sendMessage(config.groupJids.players, {
          text: `@${promoted.userId.replace(/@.*/, '')} נכנסת`,
          mentions: [promoted.userId],
        });
      }
    }
  }

  await saveTemplate(template);
  await saveWeekly(weekly);

  const rendered = renderTemplate(template);
  await sendTemplateToGroup2(sock, rendered);
  logger.info({ actionCount: actions.length }, 'Processed registration messages');
}
