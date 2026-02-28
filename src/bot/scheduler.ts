import cron from 'node-cron';
import type { WASocket } from '@whiskeysockets/baileys';
import { config } from '../config/env.js';
import { loadTemplate, saveTemplate, resetForNewWeek, saveBotControl, loadBotControl } from './state.js';
import { renderTemplate } from './template.js';
import { processCollectedMessages, sendTemplateToGroup2 } from './registration.js';
import { logger } from '../utils/logger.js';

let schedulerInitialized = false;
const tz = 'Asia/Jerusalem';

function scheduleSaturdayTimers(getSock: () => WASocket, warmupTime: string): void {
  const [warmH, warmM] = warmupTime.split(':').map(Number);

  const now = new Date();
  const israelNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));

  // 2 hours before warmup: close registration, process last messages
  const closeTime = new Date(israelNow);
  closeTime.setHours(warmH - 2, warmM, 0, 0);

  const msUntilClose = closeTime.getTime() - israelNow.getTime();

  if (msUntilClose > 0) {
    setTimeout(async () => {
      try {
        const sock = getSock();
        await processCollectedMessages(sock);
        const t = await loadTemplate();
        t.registrationOpen = false;
        await saveTemplate(t);
        logger.info('Closed registration (2h before warmup)');
      } catch (error) {
        logger.error({ error }, 'Failed to close registration');
      }
    }, msUntilClose);
    logger.info({ time: `${warmH - 2}:${String(warmM).padStart(2, '0')}` }, 'Scheduled registration close (2h before warmup)');
  }
}

export function setupScheduler(getSock: () => WASocket): void {
  if (schedulerInitialized) {
    logger.info('Scheduler already initialized, skipping duplicate setup');
    return;
  }
  schedulerInitialized = true;

  // On startup: if it's Saturday and registration is open, re-schedule the timers
  (async () => {
    try {
      const now = new Date();
      const israelNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
      if (israelNow.getDay() === 6) {
        const template = await loadTemplate();
        if (template.registrationOpen) {
          logger.info('Saturday restart detected — re-scheduling pre-game timers');
          scheduleSaturdayTimers(getSock, template.warmupTime);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to check Saturday restart');
    }
  })();

  // Friday 11:50 - Wake bot up
  cron.schedule('50 11 * * 5', async () => {
    try {
      await saveBotControl({ sleeping: false });
      logger.info('Bot woke up automatically for Friday');
    } catch (error) {
      logger.error({ error }, 'Failed to wake bot on Friday');
    }
  }, { timezone: tz });

  // Friday 11:55 - Health check to Group 1
  cron.schedule('55 11 * * 5', async () => {
    try {
      const sock = getSock();
      await sock.sendMessage(config.groupJids.managers, { text: '5 דק לפתיחה, אני מוכן!' });
      logger.info('Sent Friday health check to Group 1');
    } catch (error) {
      logger.error({ error }, 'Failed to send Friday health check');
    }
  }, { timezone: tz });

  // Friday 11:59 - Post template to Group 2
  cron.schedule('59 11 * * 5', async () => {
    try {
      const botControl = await loadBotControl();
      if (botControl.sleeping) {
        logger.info('Skipping template post — bot is sleeping');
        return;
      }
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
      const botControl = await loadBotControl();
      if (botControl.sleeping) {
        logger.info('Skipping open registration — bot is sleeping');
        return;
      }
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

  // Friday 12:05 - Process burst registrations (the big batch from 12:00-12:05)
  cron.schedule('5 12 * * 5', async () => {
    try {
      const sock = getSock();
      await processCollectedMessages(sock);
      logger.info('Processed burst registrations');
    } catch (error) {
      logger.error({ error }, 'Failed to process burst registrations');
    }
  }, { timezone: tz });

  // Every 30 minutes — process collected registration messages
  // Runs on :05 and :35. Skips Friday before 12:05 (burst handles that).
  cron.schedule('5,35 * * * *', async () => {
    try {
      const template = await loadTemplate();
      if (!template.registrationOpen) return;

      // Skip Friday 12:05 — handled by burst cron above
      const now = new Date();
      const israelNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
      if (israelNow.getDay() === 5 && israelNow.getHours() === 12 && israelNow.getMinutes() < 10) return;

      const sock = getSock();
      await processCollectedMessages(sock);
      logger.info('Processed collected messages (30-min cycle)');
    } catch (error) {
      logger.error({ error }, 'Failed to process collected messages');
    }
  }, { timezone: tz });

  // Saturday 00:00 - Schedule pre-game timers
  cron.schedule('0 0 * * 6', async () => {
    try {
      const template = await loadTemplate();
      if (!template.registrationOpen) return;
      scheduleSaturdayTimers(getSock, template.warmupTime);
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
