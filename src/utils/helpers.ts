import type { WAMessage } from '@whiskeysockets/baileys';

export function getUpcomingSaturday(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  const daysUntilSat = (6 - day + 7) % 7 || 7; // next Saturday (not today)
  const sat = new Date(now);
  sat.setDate(now.getDate() + daysUntilSat);
  return sat.toISOString().split('T')[0];
}

export function formatHebrewDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}`;
}

export function getSenderJid(msg: WAMessage): string {
  return msg.key.participant || msg.key.remoteJid || '';
}

export function normalizeJid(jid: string): string {
  // Strip :device suffix e.g. 972541234567:12@s.whatsapp.net -> 972541234567@s.whatsapp.net
  return jid.replace(/:\d+@/, '@');
}

export function isBotMentioned(msg: WAMessage, botJid: string, botLid?: string): boolean {
  const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (!mentioned || mentioned.length === 0) return false;
  const normalizedBot = normalizeJid(botJid);
  const normalizedLid = botLid ? normalizeJid(botLid) : null;
  return mentioned.some(jid => {
    const normalized = normalizeJid(jid);
    return normalized === normalizedBot || (normalizedLid && normalized === normalizedLid);
  });
}

export function getMessageText(msg: WAMessage): string {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ''
  );
}

export function isAdminCommandWindowOpen(): boolean {
  const now = new Date();
  const israelTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = israelTime.getDay(); // 0=Sun, 6=Sat
  const hours = israelTime.getHours();
  const minutes = israelTime.getMinutes();
  const timeValue = hours * 60 + minutes;

  // Window: Saturday 23:00 to Friday 11:49
  // Closed: Friday 11:50 to Saturday 22:59
  if (day === 6) {
    // Saturday: open from 23:00 onward
    return timeValue >= 23 * 60;
  }
  if (day === 5) {
    // Friday: open until 11:49
    return timeValue < 11 * 60 + 50;
  }
  // Sun-Thu: always open
  return true;
}

export function isBurstWindow(): boolean {
  const now = new Date();
  const israelTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = israelTime.getDay(); // 5=Friday
  const hours = israelTime.getHours();
  const minutes = israelTime.getMinutes();
  const timeValue = hours * 60 + minutes;

  // Friday 12:00 to 12:03
  return day === 5 && timeValue >= 12 * 60 && timeValue < 12 * 60 + 3;
}

export function parseTimeString(text: string): string | null {
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
