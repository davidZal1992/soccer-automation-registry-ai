import { readFile, mkdir } from 'fs/promises';
import writeFile from 'write-file-atomic';
import { join } from 'path';
import { config } from '../config/env.js';
import { getUpcomingSaturday } from '../utils/helpers.js';
import type { TemplateState, AdminEntry, WeeklyState, BotControlState } from '../types.js';

const DATA_DIR = './data';

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function loadState<T>(filename: string, defaultValue: T): Promise<T> {
  await ensureDataDir();
  try {
    const data = await readFile(join(DATA_DIR, filename), 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return defaultValue;
  }
}

async function saveState<T>(filename: string, state: T): Promise<void> {
  await ensureDataDir();
  await writeFile(join(DATA_DIR, filename), JSON.stringify(state, null, 2), 'utf-8');
}

// --- Template ---

export function createDefaultTemplate(): TemplateState {
  return {
    weekOf: getUpcomingSaturday(),
    warmupTime: '20:30',
    startTime: '21:00',
    slots: new Array(24).fill(null),
    waitingList: [],
    registrationOpen: false,
  };
}

export async function loadTemplate(): Promise<TemplateState> {
  return loadState<TemplateState>('template.json', createDefaultTemplate());
}

export async function saveTemplate(state: TemplateState): Promise<void> {
  await saveState('template.json', state);
}

// --- Admins ---

export async function loadAdmins(): Promise<AdminEntry[]> {
  const admins = await loadState<AdminEntry[]>('admins.json', []);
  // Seed initial admin on first run
  if (admins.length === 0 && config.initialAdminJid) {
    const initial: AdminEntry = {
      userId: config.initialAdminJid,
      name: config.initialAdminName || 'Admin',
    };
    admins.push(initial);
    await saveAdmins(admins);
  }
  return admins;
}

export async function saveAdmins(admins: AdminEntry[]): Promise<void> {
  await saveState('admins.json', admins);
}

export async function isAdmin(userId: string): Promise<boolean> {
  const admins = await loadAdmins();
  return admins.some(a => a.userId === userId);
}

// --- Weekly ---

export async function loadWeekly(): Promise<WeeklyState> {
  return loadState<WeeklyState>('weekly.json', {
    userIdMap: {},
    messagesCollected: [],
  });
}

export async function saveWeekly(state: WeeklyState): Promise<void> {
  await saveState('weekly.json', state);
}

// --- Bot Control ---

export async function loadBotControl(): Promise<BotControlState> {
  return loadState<BotControlState>('bot-control.json', { sleeping: true });
}

export async function saveBotControl(state: BotControlState): Promise<void> {
  await saveState('bot-control.json', state);
}

// --- Reset ---

export async function resetForNewWeek(): Promise<void> {
  await saveTemplate(createDefaultTemplate());
  await saveWeekly({ userIdMap: {}, messagesCollected: [] });
  await saveBotControl({ sleeping: false });
}
