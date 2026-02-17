import cron from 'node-cron';
import type { WASocket } from '@whiskeysockets/baileys';
import { config } from '../config/env.js';
import { loadTemplate, saveTemplate, resetForNewWeek, saveBotControl } from './state.js';
import { renderTemplate } from './template.js';
import { processBurstRegistrations, processHourlyRefresh, sendTemplateToGroup2 } from './registration.js';
import { logger } from '../utils/logger.js';

let schedulerInitialized = false;

export function setupScheduler(getSock: () => WASocket): void {
  if (schedulerInitialized) {
    logger.info('Scheduler already initialized, skipping duplicate setup');
    return;
  }
  schedulerInitialized = true;

  const tz = 'Asia/Jerusalem';

  // Friday 11:50 - Wake bot up (safe: registrationOpen is still false, no messages sent)
  cron.schedule('50 11 * * 5', async () => {
    try {
      await saveBotControl({ sleeping: false });
      logger.info('Bot woke up automatically for Friday');
    } catch (error) {
      logger.error({ error }, 'Failed to wake bot on Friday');
    }
  }, { timezone: tz });

  // Friday 11:59 - Post template to Group 2
  cron.schedule('59 11 * * 5', async () => {
    try {
      const sock = getSock();
      const template = await loadTemplate();
      const rendered = renderTemplate(template);
      await sendTemplateToGroup2(sock, rendered);
      logger.info('Posted template to Group 2');
    } catch (error) {
      logger.error({ error }, 'Failed to post template on Friday');
    }
  }, { timezone: tz });

  // Friday 12:00 - Open Group 2, set registrationOpen
  cron.schedule('0 12 * * 5', async () => {
    try {
      const sock = getSock();
      await sock.groupSettingUpdate(config.groupJids.players, 'not_announcement');
      const template = await loadTemplate();
      template.registrationOpen = true;
      await saveTemplate(template);
      logger.info('Opened Group 2 for registration');
    } catch (error) {
      logger.error({ error }, 'Failed to open Group 2');
    }
  }, { timezone: tz });

  // Friday 12:03 - Process burst registrations
  cron.schedule('3 12 * * 5', async () => {
    try {
      const sock = getSock();
      await processBurstRegistrations(sock);
      logger.info('Processed burst registrations');
    } catch (error) {
      logger.error({ error }, 'Failed to process burst registrations');
    }
  }, { timezone: tz });

  // Hourly refresh (every hour from 13:00 Friday through Saturday)
  cron.schedule('0 * * * *', async () => {
    try {
      const template = await loadTemplate();
      if (!template.registrationOpen) return;
      const sock = getSock();
      await processHourlyRefresh(sock);
    } catch (error) {
      logger.error({ error }, 'Failed hourly refresh');
    }
  }, { timezone: tz });

  // Saturday - every minute check for pre-game warnings
  cron.schedule('* * * * 6', async () => {
    try {
      const template = await loadTemplate();
      if (!template.registrationOpen) return;

      const now = new Date();
      const israelTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
      const currentMinutes = israelTime.getHours() * 60 + israelTime.getMinutes();

      const [warmH, warmM] = template.warmupTime.split(':').map(Number);
      const warmupMinutes = warmH * 60 + warmM;

      const sock = getSock();

      // 20 min before warmup
      if (currentMinutes === warmupMinutes - 20) {
        await sock.sendMessage(config.groupJids.players, {
          text: 'ביטולים אחרונים? ⏳',
        });
        logger.info('Sent last cancellations warning');
      }

      // 15 min before warmup - close registration, lock group
      if (currentMinutes === warmupMinutes - 15) {
        template.registrationOpen = false;
        await saveTemplate(template);
        await sock.groupSettingUpdate(config.groupJids.players, 'announcement');
        // Process any remaining messages
        await processHourlyRefresh(sock);
        const rendered = renderTemplate(template);
        await sendTemplateToGroup2(sock, rendered);
        logger.info('Closed registration and locked Group 2');
      }
    } catch (error) {
      logger.error({ error }, 'Failed Saturday pre-game check');
    }
  }, { timezone: tz });

  // Saturday 23:00 - Reset for new week
  cron.schedule('0 23 * * 6', async () => {
    try {
      await resetForNewWeek();
      logger.info('Reset for new week');
    } catch (error) {
      logger.error({ error }, 'Failed to reset for new week');
    }
  }, { timezone: tz });

  // Sunday 11:00 - Post clean template to Group 1
  cron.schedule('0 11 * * 0', async () => {
    try {
      const sock = getSock();
      const template = await loadTemplate();
      const rendered = renderTemplate(template);
      await sock.sendMessage(config.groupJids.managers, { text: rendered });
      logger.info('Posted clean template to Group 1');
    } catch (error) {
      logger.error({ error }, 'Failed to post Sunday template');
    }
  }, { timezone: tz });

  logger.info('Scheduler initialized with all cron jobs');
}
