/**
 * Sandboxed test registration for Group 3.
 * Collects messages, waits 60 seconds, then reports what would happen — no real state changes.
 */
import type { WASocket } from '@whiskeysockets/baileys';
import { parseRegistrationMessages } from './claude.js';
import { normalizeJid } from '../utils/helpers.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { CollectedMessage } from '../types.js';

const testBuffer: CollectedMessage[] = [];
let processTimer: ReturnType<typeof setTimeout> | null = null;
let savedSock: WASocket | null = null;

const DELAY_MS = 60_000;

export function collectTestMessage(sock: WASocket, msgId: string, senderJid: string, text: string): void {
  savedSock = sock;
  testBuffer.push({ msgId, senderJid: normalizeJid(senderJid), text, timestamp: Date.now() });
  logger.info({ msgId, text }, '[TEST] Collected');

  if (!processTimer) {
    processTimer = setTimeout(async () => {
      processTimer = null;
      if (savedSock) await runTestProcess(savedSock);
    }, DELAY_MS);
    logger.info('[TEST] 60-second timer started');
  }
}

export function editTestMessage(msgId: string, newText: string): void {
  const msg = testBuffer.find(m => m.msgId === msgId);
  if (msg) {
    logger.info({ msgId, old: msg.text, new: newText }, '[TEST] Edit captured');
    msg.text = newText;
  }
}

export function removeTestMessage(msgId: string): void {
  const idx = testBuffer.findIndex(m => m.msgId === msgId);
  if (idx !== -1) {
    testBuffer.splice(idx, 1);
    logger.info({ msgId }, '[TEST] Message removed');
  }
}

async function runTestProcess(sock: WASocket): Promise<void> {
  if (testBuffer.length === 0) return;

  const messages = [...testBuffer];
  testBuffer.length = 0;

  logger.info({ count: messages.length }, '[TEST] Processing test buffer');

  // Show what's in the buffer before sending to LLM
  const bufferLines = messages.map(m => `• "${m.text}"`).join('\n');

  const actions = await parseRegistrationMessages(messages);

  const resultLines: string[] = [];
  const seen = new Set<string>();

  for (const action of actions) {
    const uid = normalizeJid(action.userId);
    if (seen.has(uid)) continue;
    seen.add(uid);

    if (action.type === 'register') {
      const name = action.name?.trim();
      if (!name || name.split(/\s+/).length < 2) {
        resultLines.push(`❌ SKIP — "${name}" is not a full name (needs first + last)`);
      } else {
        resultLines.push(`✅ WOULD REGISTER: *${name}*`);
      }
    } else if (action.type === 'cancel') {
      resultLines.push(`🔄 WOULD CANCEL for ${uid}`);
    } else if (action.type === 'cancel_waiting') {
      resultLines.push(`🔄 WOULD CANCEL WAITING for ${uid}`);
    }
  }

  if (resultLines.length === 0) {
    resultLines.push('❌ No valid actions parsed from messages');
  }

  const reply = [
    '🧪 *Test Results* (no real changes made)',
    '',
    `*Messages in buffer:*\n${bufferLines}`,
    '',
    `*LLM parsed:*\n${resultLines.join('\n')}`,
  ].join('\n');

  await sock.sendMessage(config.groupJids.test!, { text: reply });
  logger.info('[TEST] Sent results to Group 3');
}
