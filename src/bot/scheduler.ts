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

  // Saturday - schedule pre-game warnings based on warmup time
  // Runs once Saturday at 00:00 to set exact timeouts
  cron.schedule('0 0 * * 6', async () => {
    try {
      const template = await loadTemplate();
      if (!template.registrationOpen) return;

      const [warmH, warmM] = template.warmupTime.split(':').map(Number);

      const now = new Date();
      const israelNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));

      // Calculate target times in Israel timezone
      const warning20 = new Date(israelNow);
      warning20.setHours(warmH, warmM - 20, 0, 0);

      const closeReg = new Date(israelNow);
      closeReg.setHours(warmH, warmM - 15, 0, 0);

      // Convert to delays from now
      const msUntilWarning = warning20.getTime() - israelNow.getTime();
      const msUntilClose = closeReg.getTime() - israelNow.getTime();

      if (msUntilWarning > 0) {
        setTimeout(async () => {
          try {
            const sock = getSock();
            await sock.sendMessage(config.groupJids.players, {
              text: 'ביטולים אחרונים? ⏳',
            });
            logger.info('Sent last cancellations warning');
          } catch (error) {
            logger.error({ error }, 'Failed to send warning');
          }
        }, msUntilWarning);
        logger.info({ time: `${warmH}:${String(warmM - 20).padStart(2, '0')}` }, 'Scheduled 20-min warning');
      }

      if (msUntilClose > 0) {
        setTimeout(async () => {
          try {
            const sock = getSock();
            const t = await loadTemplate();
            t.registrationOpen = false;
            await saveTemplate(t);
            await processHourlyRefresh(sock);
            logger.info('Closed registration');
          } catch (error) {
            logger.error({ error }, 'Failed to close registration');
          }
        }, msUntilClose);
        logger.info({ time: `${warmH}:${String(warmM - 15).padStart(2, '0')}` }, 'Scheduled registration close');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to schedule Saturday events');
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
