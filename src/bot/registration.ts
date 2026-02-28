import type { WASocket, proto } from '@whiskeysockets/baileys';
import { loadWeekly, saveWeekly, loadTemplate, saveTemplate, loadBotControl } from './state.js';
import { renderTemplate } from './template.js';
import { addPlayerToTemplate, removePlayerFromTemplate, promoteFromWaitingList } from './admin.js';
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
  msgId: string,
  senderJid: string,
  text: string,
): Promise<void> {
  const weekly = await loadWeekly();
  weekly.messagesCollected.push({
    msgId,
    senderJid: normalizeJid(senderJid),
    text,
    timestamp: Date.now(),
  });
  await saveWeekly(weekly);
}

export async function removeCollectedMessage(msgId: string): Promise<void> {
  const weekly = await loadWeekly();
  const idx = weekly.messagesCollected.findIndex(m => m.msgId === msgId);
  if (idx !== -1) {
    weekly.messagesCollected.splice(idx, 1);
    await saveWeekly(weekly);
    logger.debug({ msgId }, 'Removed deleted message from collected buffer');
  }
}

export async function editCollectedMessage(msgId: string, newText: string): Promise<void> {
  const weekly = await loadWeekly();
  const msg = weekly.messagesCollected.find(m => m.msgId === msgId);
  if (msg) {
    msg.text = newText;
    await saveWeekly(weekly);
    logger.debug({ msgId, newText: newText.substring(0, 50) }, 'Updated edited message in collected buffer');
  }
}

export async function clearCollectedMessages(): Promise<void> {
  const weekly = await loadWeekly();
  weekly.messagesCollected = [];
  await saveWeekly(weekly);
  logger.info('Cleared collected messages buffer (bot going to sleep)');
}

export async function processCollectedMessages(sock: WASocket): Promise<void> {
  const botControl = await loadBotControl();
  if (botControl.sleeping) {
    logger.info('Skipping processCollectedMessages — bot is sleeping');
    return;
  }

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

  // Security: build set of actual sender JIDs from the message batch
  const senderJids = new Set(messages.map(m => normalizeJid(m.senderJid)));

  // Dedup: one action per userId
  const seen = new Set<string>();
  const promotedPlayers: { name: string; userId: string }[] = [];

  for (const action of actions) {
    const normalizedId = normalizeJid(action.userId);
    if (seen.has(normalizedId)) continue;
    seen.add(normalizedId);

    if (action.type === 'register') {
      const name = action.name?.trim();
      if (!name || name.split(/\s+/).length < 2) continue;
      // Skip if already registered by userId
      if (weekly.userIdMap[normalizedId]) continue;
      // Skip if this name is already in the template (different person, same name)
      const nameExists = template.slots.some(s => s && s.name === name)
        || template.waitingList.some(w => w.name === name);
      if (nameExists) {
        logger.info({ name, userId: normalizedId }, 'Skipped duplicate name registration');
        continue;
      }
      weekly.userIdMap[normalizedId] = name;
      addPlayerToTemplate(template, {
        name,
        userId: normalizedId,
        isLaundry: false,
        isEquipment: false,
      });
    } else if (action.type === 'cancel_waiting') {
      // Security: only allow cancellation if the userId was an actual sender in this batch
      if (!senderJids.has(normalizedId)) {
        logger.warn({ actionUserId: normalizedId, type: action.type }, 'Blocked cancel — userId is not an actual sender');
        continue;
      }
      // "מבטל המתנה" — only remove from the waiting/holding list, no promotion
      let waitIndex = template.waitingList.findIndex(
        w => normalizeJid(w.userId) === normalizedId,
      );
      // Fallback: match by name (for overridden templates with empty userIds)
      if (waitIndex === -1 && weekly.userIdMap[normalizedId]) {
        const playerName = weekly.userIdMap[normalizedId];
        waitIndex = template.waitingList.findIndex(w => !w.userId && w.name === playerName);
      }
      if (waitIndex === -1) continue; // not in holding list, ignore
      template.waitingList.splice(waitIndex, 1);
      delete weekly.userIdMap[normalizedId];
    } else if (action.type === 'cancel') {
      // Security: only allow cancellation if the userId was an actual sender in this batch
      if (!senderJids.has(normalizedId)) {
        logger.warn({ actionUserId: normalizedId, type: action.type }, 'Blocked cancel — userId is not an actual sender');
        continue;
      }
      // Check both weekly map and template directly (player may have been added via Group 1)
      const playerName = weekly.userIdMap[normalizedId];
      const inWeekly = !!playerName;
      const inTemplate = template.slots.some(s => s && normalizeJid(s.userId) === normalizedId)
        || template.waitingList.some(w => normalizeJid(w.userId) === normalizedId);
      // Fallback: check by name in template (for overridden templates with empty userIds)
      const inTemplateByName = !inTemplate && playerName
        ? template.slots.some(s => s && !s.userId && s.name === playerName)
          || template.waitingList.some(w => !w.userId && w.name === playerName)
        : false;
      if (!inWeekly && !inTemplate && !inTemplateByName) continue;
      delete weekly.userIdMap[normalizedId];
      if (inTemplate) {
        const { promoted } = removePlayerFromTemplate(template, normalizedId);
        if (promoted?.userId) {
          promotedPlayers.push({ name: promoted.name, userId: promoted.userId });
        }
      } else if (inTemplateByName && playerName) {
        // Remove by name — find slot or waiting list entry
        const slotIdx = template.slots.findIndex(s => s && !s.userId && s.name === playerName);
        if (slotIdx !== -1) {
          template.slots[slotIdx] = null;
          const promoted = promoteFromWaitingList(template, slotIdx);
          if (promoted?.userId) {
            promotedPlayers.push({ name: promoted.name, userId: promoted.userId });
          }
        } else {
          const wIdx = template.waitingList.findIndex(w => !w.userId && w.name === playerName);
          if (wIdx !== -1) template.waitingList.splice(wIdx, 1);
        }
      }
    }
  }

  await saveTemplate(template);
  await saveWeekly(weekly);

  // Send template first, then promotion tags
  const rendered = renderTemplate(template);
  await sendTemplateToGroup2(sock, rendered);

  if (promotedPlayers.length > 0) {
    const mentions = promotedPlayers.map(p => p.userId);
    const tags = promotedPlayers.map(p => `@${p.userId.replace(/@.*/, '')}`).join(' ');
    const verb = promotedPlayers.length === 1 ? 'נכנסת' : 'נכנסתם';
    await sock.sendMessage(config.groupJids.players, {
      text: `${tags} ${verb}`,
      mentions,
    });
  }

  logger.info({ actionCount: actions.length }, 'Processed registration messages');
}
