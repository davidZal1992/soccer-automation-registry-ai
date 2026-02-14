import { setupErrorHandlers } from './utils/errors.js';

// Setup error handlers FIRST before any other code
setupErrorHandlers();

import makeWASocket, { DisconnectReason, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { logger } from './utils/logger.js';
import { config } from './config/env.js';
import { useJsonAuthState } from './auth/authState.js';
import { handleCredsUpdate } from './handlers/credentials.js';
import { handleConnectionUpdate } from './handlers/connection.js';

async function startSocket(): Promise<void> {
  // Load auth state
  const { state, saveCreds } = await useJsonAuthState('./data/auth');

  // Create WhatsApp socket
  const sock = makeWASocket({
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: true,
  });

  // Register event handlers
  sock.ev.on('creds.update', handleCredsUpdate(saveCreds));
  sock.ev.on('connection.update', handleConnectionUpdate(startSocket));

  logger.info('Starting WhatsApp bot...');
}

// Start the bot
startSocket();
