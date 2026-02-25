import type { WASocket, WAMessage, WAMessageKey, WAMessageUpdate } from '@whiskeysockets/baileys';
import { config } from '../config/env.js';
import { getSenderJid, normalizeJid, isBotMentioned, getMessageText, isAdminCommandWindowOpen } from '../utils/helpers.js';
import { isAdmin, loadTemplate, loadBotControl, saveBotControl } from '../bot/state.js';
import { executeAdminCommand, overrideTemplateFromText } from '../bot/admin.js';
import { parseAdminCommandWithLLM } from '../bot/claude.js';
import {
  collectRegistrationMessage,
  removeCollectedMessage,
  editCollectedMessage,
} from '../bot/registration.js';
import { logger } from '../utils/logger.js';

/**
 * WhatsApp message edits arrive as a new messages.upsert event (not messages.update).
 * They carry a protocolMessage with type=14 (MESSAGE_EDIT) that contains the original
 * message key and the new text content.
 */
function getEditInfo(msg: WAMessage): { originalId: string; newText: string } | null {
  const proto = msg.message?.protocolMessage;
  // type 14 = MESSAGE_EDIT
  if (proto && (proto.type as number) === 14 && proto.key?.id) {
    const newText =
      proto.editedMessage?.conversation ||
      proto.editedMessage?.extendedTextMessage?.text ||
      '';
    if (newText) return { originalId: proto.key.id, newText };
  }
  return null;
}

function getMentionedJids(msg: WAMessage, botJid: string, botLid?: string): string[] {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const normalizedBot = normalizeJid(botJid);
  const normalizedLid = botLid ? normalizeJid(botLid) : null;
  return mentioned
    .map(jid => normalizeJid(jid))
    .filter(jid => jid !== normalizedBot && jid !== normalizedLid);
}

export function handleMessagesUpsert(sock: WASocket) {
  const botJid = sock.user?.id || '';
  const botLid = (sock.user as unknown as Record<string, unknown>)?.lid as string | undefined;

  logger.info({ botJid, botLid }, 'Message handler initialized');

  return async (event: { messages: WAMessage[]; type: string }) => {
    if (event.type !== 'notify') return;

    for (const msg of event.messages) {
      try {
        // Skip own messages and status broadcasts
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid === 'status@broadcast') continue;

        const chatJid = msg.key.remoteJid;
        if (!chatJid) continue;

        const senderJid = normalizeJid(getSenderJid(msg));

        // Detect WhatsApp edits — come as messages.upsert with protocolMessage type 14,
        // NOT via messages.update. Handle them before the text check.
        const editInfo = getEditInfo(msg);
        if (editInfo) {
          logger.debug({ chatJid, originalId: editInfo.originalId, newText: editInfo.newText.substring(0, 50) }, 'Edit event detected');
          if (chatJid === config.groupJids.players) {
            await editCollectedMessage(editInfo.originalId, editInfo.newText);
          }
          continue;
        }

        const text = getMessageText(msg).trim();
        if (!text) continue;

        logger.debug({ chatJid, senderJid, text: text.substring(0, 50) }, 'Incoming message');

        // Group 1 (Managers) routing
        if (chatJid === config.groupJids.managers) {
          await handleGroup1Message(sock, msg, text, senderJid, botJid, botLid);
          continue;
        }

        // Group 2 (Players) routing
        if (chatJid === config.groupJids.players) {
          await handleGroup2Message(sock, msg, text, senderJid, botJid, botLid);
          continue;
        }

        // Group 3 (Test) routing — behaves like Group 1
        if (config.groupJids.test && chatJid === config.groupJids.test) {
          await handleGroup1Message(sock, msg, text, senderJid, botJid, botLid);
          continue;
        }
      } catch (error) {
        logger.error({ error, msgKey: msg.key }, 'Error processing message');
      }
    }
  };
}

async function handleGroup1Message(
  sock: WASocket,
  msg: WAMessage,
  text: string,
  senderJid: string,
  botJid: string,
  botLid?: string,
): Promise<void> {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  logger.info({ botJid, botLid, mentioned, senderJid, text: text.substring(0, 50) }, 'Group 1 message received');

  // Bot ONLY responds when @tagged
  if (!isBotMentioned(msg, botJid, botLid)) {
    logger.info('Dropped: bot not mentioned');
    return;
  }

  // Must be admin
  if (!(await isAdmin(senderJid))) {
    logger.info({ senderJid }, 'Dropped: not admin');
    return;
  }

  // Must be within command window
  if (!isAdminCommandWindowOpen()) {
    logger.info('Dropped: outside command window');
    return;
  }

  // Strip bot mention from text to get the command
  const commandText = text.replace(/@\d+/g, '').trim();
  logger.info({ commandText }, 'Parsing admin command with LLM');

  // Extract mentioned JIDs (excluding the bot itself)
  const mentionedJids = getMentionedJids(msg, botJid, botLid);

  const command = await parseAdminCommandWithLLM(commandText, mentionedJids);
  if (!command) {
    logger.info({ commandText }, 'LLM returned null — unrecognized command');
    return;
  }

  logger.info({ command }, 'Executing admin command');
  await executeAdminCommand(sock, msg, command, senderJid);
}

const SLEEP_PATTERN = /^(שינה|לישון|תלך\s*לישון|לך\s*לישון)$/;
const WAKE_PATTERN = /^(התעורר|תתעורר|קום|תקום)$/;
// Matches a message that contains at least 3 numbered lines (1. xxx, 2. xxx, 3. xxx)
const OVERRIDE_PATTERN = /(?:^|\n)\d+\.\s*.+(?:\n\d+\.\s*.+){2,}/m;

async function handleGroup2Message(
  sock: WASocket,
  msg: WAMessage,
  text: string,
  senderJid: string,
  botJid: string,
  botLid?: string,
): Promise<void> {
  logger.info({ senderJid, text: text.substring(0, 50) }, 'Group 2 message received');

  const botMentioned = isBotMentioned(msg, botJid, botLid);

  // Admin + @mention commands
  if (botMentioned && (await isAdmin(senderJid))) {
    const commandText = text.replace(/@\d+/g, '').trim();

    if (SLEEP_PATTERN.test(commandText)) {
      await saveBotControl({ sleeping: true });
      await sock.sendMessage(config.groupJids.players, { text: 'הבוט הולך לישון 😴' });
      return;
    }
    if (WAKE_PATTERN.test(commandText)) {
      await saveBotControl({ sleeping: false });
      await sock.sendMessage(config.groupJids.players, { text: 'הבוט התעורר! 🌅' });
      return;
    }

    // Override template — admin pastes a numbered list
    if (OVERRIDE_PATTERN.test(commandText)) {
      await overrideTemplateFromText(commandText);
      return;
    }
  }

  // If bot is @mentioned for anything else, ignore
  if (botMentioned) return;

  const botControl = await loadBotControl();

  // If sleeping, ignore everything else
  if (botControl.sleeping) return;

  // Check if registration is open
  const template = await loadTemplate();
  if (!template.registrationOpen) return;

  // Collect all messages to disk — processed every 30 min by cron
  const msgId = msg.key.id || '';
  await collectRegistrationMessage(msgId, senderJid, text);
}

export function handleMessagesDelete() {
  return async (event: { keys: WAMessageKey[] } | { jid: string; all: true }) => {
    if ('all' in event) return;

    for (const key of event.keys) {
      if (!key.id || key.remoteJid !== config.groupJids.players) continue;
      await removeCollectedMessage(key.id);
    }
  };
}

export function handleMessagesUpdate() {
  return async (updates: WAMessageUpdate[]) => {
    for (const update of updates) {
      const key = update.key;
      if (!key.id || key.remoteJid !== config.groupJids.players) continue;

      const editedMsg = update.update?.message;
      if (!editedMsg) continue;

      const newText =
        editedMsg.conversation ||
        editedMsg.extendedTextMessage?.text ||
        '';
      if (!newText) continue;

      await editCollectedMessage(key.id, newText);
    }
  };
}
