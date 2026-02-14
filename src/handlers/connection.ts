import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { logger } from '../utils/logger.js';

export function handleConnectionUpdate(startSocket: () => void) {
  return (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('Scan QR code with WhatsApp');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        logger.info('Connection closed, reconnecting...');
        startSocket();
      } else {
        logger.info('Logged out, not reconnecting (prevents infinite QR loop)');
      }
    }

    if (connection === 'open') {
      logger.info('Connected to WhatsApp');
    }
  };
}
