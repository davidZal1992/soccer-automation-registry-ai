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
import { handleMessagesUpsert, handleMessagesDelete, handleMessagesUpdate } from './handlers/message.js';
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
    version: [2, 3000, 1033893291],
    browser: ['SoccerBot', 'Chrome', '145.0.0'],
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
      const pairingPhone = process.env.PAIRING_PHONE_NUMBER;
      if (pairingPhone) {
        // Use pairing code instead of QR (works from datacenter IPs)
        try {
          const code = await sock.requestPairingCode(pairingPhone);
          logger.info(`\n\n  *** PAIRING CODE: ${code} ***\n  Enter this in WhatsApp → Linked Devices → Link with phone number\n`);
        } catch (err) {
          logger.error({ err }, 'Failed to get pairing code, falling back to QR');
          import('qrcode-terminal').then(mod => mod.default.generate(qr, { small: true }));
        }
      } else {
        logger.info('Scan QR code with WhatsApp');
        import('qrcode-terminal').then(mod => mod.default.generate(qr, { small: true }));
      }
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

      logger.info({ botJid: sock.user?.id, botLid: (sock.user as any)?.lid }, 'Bot identity');

      if (!schedulerSetup) {
        schedulerSetup = true;
        setupScheduler(() => currentSock!);
        logger.info('Bot fully connected and scheduler initialized');
      }
    }
  });

  sock.ev.on('messages.upsert', handleMessagesUpsert(sock));
  sock.ev.on('messages.delete', handleMessagesDelete());
  sock.ev.on('messages.update', handleMessagesUpdate());

  logger.info('Starting WhatsApp bot...');
}

startSocket();
