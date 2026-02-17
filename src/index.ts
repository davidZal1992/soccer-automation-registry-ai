import { setupErrorHandlers } from './utils/errors.js';

// Setup error handlers FIRST before any other code
setupErrorHandlers();

import makeWASocket, { DisconnectReason, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { logger } from './utils/logger.js';
import { config } from './config/env.js';
import { useJsonAuthState } from './auth/authState.js';
import { handleCredsUpdate } from './handlers/credentials.js';
import { handleMessagesUpsert } from './handlers/message.js';
import { setupScheduler } from './bot/scheduler.js';

let currentSock: WASocket | null = null;
let schedulerSetup = false;

async function startSocket(): Promise<void> {
  // Close previous socket if it exists to prevent conflict errors
  if (currentSock) {
    currentSock.end(new Error('Reconnecting'));
    currentSock = null;
  }

  const { state, saveCreds } = await useJsonAuthState('./data/auth');

  const sock = makeWASocket({
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: true,
  });

  currentSock = sock;

  sock.ev.on('creds.update', handleCredsUpdate(saveCreds));

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('Scan QR code with WhatsApp');
      import('qrcode-terminal').then(mod => mod.default.generate(qr, { small: true }));
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        logger.info({ statusCode }, 'Connection closed, reconnecting in 3s...');
        setTimeout(startSocket, 3000);
      } else {
        logger.info('Logged out, not reconnecting');
      }
    }

    if (connection === 'open') {
      logger.info('Connected to WhatsApp');

      // Log group participants to help identify LIDs
      try {
        const g1 = await sock.groupMetadata(config.groupJids.managers);
        logger.info(
          { group: g1.subject, participants: g1.participants.map(p => ({ jid: p.id, admin: p.admin })) },
          'Group 1 participants',
        );
      } catch (e) {
        logger.warn({ error: e }, 'Could not fetch Group 1 metadata');
      }

      if (!schedulerSetup) {
        schedulerSetup = true;
        setupScheduler(() => currentSock!);
        logger.info('Bot fully connected and scheduler initialized');
      }

      // --- TEST MODE: Remove after testing ---
      if (process.env.TEST_GROUP_CLOSE === 'true') {
        logger.info('🧪 Will close Group 2 in 2 minutes');
        setTimeout(async () => {
          try {
            await sock.groupSettingUpdate(config.groupJids.players, 'announcement');
            logger.info('🧪 Group 2 closed');
          } catch (e) {
            logger.error({ error: e }, '🧪 Failed to close Group 2');
          }
        }, 2 * 60 * 1000);
      }
      // --- END TEST MODE ---
    }
  });

  sock.ev.on('messages.upsert', handleMessagesUpsert(sock));

  logger.info('Starting WhatsApp bot...');
}

startSocket();
