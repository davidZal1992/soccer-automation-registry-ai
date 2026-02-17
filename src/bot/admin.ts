import type { WASocket, WAMessage } from '@whiskeysockets/baileys';
import type { AdminCommand, PlayerSlot, TemplateState } from '../types.js';
import { loadTemplate, saveTemplate, loadAdmins, saveAdmins } from './state.js';
import { renderTemplate } from './template.js';
import { normalizeJid } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';

function isFullName(name: string): boolean {
  return name.split(/\s+/).length >= 2;
}

export function addPlayerToTemplate(
  template: TemplateState,
  player: PlayerSlot,
): void {
  // Check if already in slots by userId
  const existingSlot = template.slots.findIndex(
    s => s && s.userId && normalizeJid(s.userId) === normalizeJid(player.userId),
  );
  if (existingSlot !== -1) return;

  // Check if already in waiting list by userId
  if (template.waitingList.some(w => w.userId && normalizeJid(w.userId) === normalizeJid(player.userId))) return;

  // Check if name already exists from a manual override (userId is empty) — link the userId
  const manualSlot = template.slots.findIndex(
    s => s && !s.userId && s.name === player.name,
  );
  if (manualSlot !== -1) {
    template.slots[manualSlot]!.userId = player.userId;
    return;
  }
  const manualWait = template.waitingList.findIndex(
    w => !w.userId && w.name === player.name,
  );
  if (manualWait !== -1) {
    template.waitingList[manualWait].userId = player.userId;
    return;
  }

  // Find first empty slot
  const emptySlot = template.slots.findIndex(s => s === null);
  if (emptySlot !== -1) {
    // Slot 24 (index 23) is laundry duty if no one else has it
    if (emptySlot === 23 && !template.slots.some(s => s?.isLaundry)) {
      player.isLaundry = true;
    }
    template.slots[emptySlot] = player;
  } else {
    template.waitingList.push(player);
  }
}

export function removePlayerFromTemplate(
  template: TemplateState,
  userId: string,
): PlayerSlot | null {
  const normalized = normalizeJid(userId);

  // Check slots
  const slotIndex = template.slots.findIndex(
    s => s && normalizeJid(s.userId) === normalized,
  );
  if (slotIndex !== -1) {
    const removed = template.slots[slotIndex]!;
    template.slots[slotIndex] = null;
    promoteFromWaitingList(template, removed.isLaundry ? slotIndex : slotIndex);
    return removed;
  }

  // Check waiting list
  const waitIndex = template.waitingList.findIndex(
    w => normalizeJid(w.userId) === normalized,
  );
  if (waitIndex !== -1) {
    return template.waitingList.splice(waitIndex, 1)[0];
  }

  return null;
}

export function promoteFromWaitingList(
  template: TemplateState,
  vacatedSlotIndex: number,
): void {
  if (template.waitingList.length === 0) return;

  const promoted = template.waitingList.shift()!;
  // If the vacated slot was laundry (slot 24, index 23), promoted player inherits כביסה
  if (vacatedSlotIndex === 23) {
    promoted.isLaundry = true;
  }
  template.slots[vacatedSlotIndex] = promoted;
}

export async function executeAdminCommand(
  sock: WASocket,
  msg: WAMessage,
  command: AdminCommand,
  senderJid: string,
): Promise<void> {
  const chatJid = msg.key.remoteJid!;
  const template = await loadTemplate();

  switch (command.type) {
    case 'register_self': {
      const admins = await loadAdmins();
      const admin = admins.find(a => a.userId === normalizeJid(senderJid));
      if (!admin) return;
      addPlayerToTemplate(template, {
        name: admin.name,
        userId: normalizeJid(senderJid),
        isLaundry: false,
        isEquipment: false,
      });
      break;
    }

    case 'remove_self': {
      removePlayerFromTemplate(template, senderJid);
      break;
    }

    case 'set_equipment': {
      if (!isFullName(command.name)) {
        await sock.sendMessage(chatJid, { text: 'צריך שם מלא (שם פרטי + משפחה) לציוד' });
        return;
      }
      // Find player by name in slots or waiting list
      const eqSlotIdx = template.slots.findIndex(
        s => s && s.name === command.name,
      );
      if (eqSlotIdx !== -1) {
        template.slots[eqSlotIdx]!.isEquipment = true;
      } else {
        const eqWaitIdx = template.waitingList.findIndex(w => w.name === command.name);
        if (eqWaitIdx !== -1) {
          template.waitingList[eqWaitIdx].isEquipment = true;
        } else {
          // Player not registered yet — add them with equipment flag
          addPlayerToTemplate(template, {
            name: command.name,
            userId: '',
            isLaundry: false,
            isEquipment: true,
          });
        }
      }
      break;
    }

    case 'set_laundry': {
      if (!isFullName(command.name)) {
        await sock.sendMessage(chatJid, { text: 'צריך שם מלא (שם פרטי + משפחה) לכביסה' });
        return;
      }
      // Remove from current position
      const removed = removePlayerFromTemplate(template, '');
      // Find by name instead
      let found = false;
      for (let i = 0; i < template.slots.length; i++) {
        if (template.slots[i]?.name === command.name) {
          // Move to slot 24 (index 23)
          const player = template.slots[i]!;
          template.slots[i] = null;
          player.isLaundry = true;
          // If slot 23 is occupied, swap
          if (template.slots[23] && template.slots[23].name !== command.name) {
            const displaced = template.slots[23];
            displaced.isLaundry = false;
            template.slots[23] = player;
            // Put displaced in the vacated slot
            template.slots[i] = displaced;
          } else {
            template.slots[23] = player;
          }
          found = true;
          break;
        }
      }
      if (!found) {
        // Check waiting list
        const waitIdx = template.waitingList.findIndex(w => w.name === command.name);
        if (waitIdx !== -1) {
          const player = template.waitingList.splice(waitIdx, 1)[0];
          player.isLaundry = true;
          if (template.slots[23]) {
            const displaced = template.slots[23];
            displaced.isLaundry = false;
            template.slots[23] = player;
            // displaced goes back to an empty slot or waiting list
            const emptySlot = template.slots.findIndex(s => s === null);
            if (emptySlot !== -1) {
              template.slots[emptySlot] = displaced;
            } else {
              template.waitingList.push(displaced);
            }
          } else {
            template.slots[23] = player;
          }
          found = true;
        }
      }
      if (!found) {
        // Player not registered yet — add them directly to slot 24 with laundry flag
        const newPlayer: PlayerSlot = {
          name: command.name,
          userId: '',
          isLaundry: true,
          isEquipment: false,
        };
        if (template.slots[23]) {
          const displaced = template.slots[23];
          displaced.isLaundry = false;
          template.slots[23] = newPlayer;
          const emptySlot = template.slots.findIndex(s => s === null);
          if (emptySlot !== -1) {
            template.slots[emptySlot] = displaced;
          } else {
            template.waitingList.push(displaced);
          }
        } else {
          template.slots[23] = newPlayer;
        }
        found = true;
      }
      break;
    }

    case 'set_warmup_time': {
      template.warmupTime = command.time;
      break;
    }

    case 'set_start_time': {
      template.startTime = command.time;
      break;
    }

    case 'show_template': {
      const rendered = renderTemplate(template);
      await sock.sendMessage(chatJid, { text: rendered });
      logger.info({ command: command.type, sender: senderJid }, 'Admin command executed');
      return; // No save needed
    }

    case 'add_admin': {
      const admins = await loadAdmins();
      const normalizedJid = normalizeJid(command.jid);
      if (admins.some(a => a.userId === normalizedJid)) {
        await sock.sendMessage(chatJid, { text: `${command.name} כבר אדמין` });
        return;
      }
      admins.push({ userId: normalizedJid, name: command.name });
      await saveAdmins(admins);
      await sock.sendMessage(chatJid, { text: `${command.name} נוסף כאדמין ✅` });
      logger.info({ command: command.type, sender: senderJid, newAdmin: normalizedJid }, 'Admin command executed');
      return; // No template save needed
    }

    case 'remove_admin': {
      const admins = await loadAdmins();
      const normalizedJid = normalizeJid(command.jid);
      const idx = admins.findIndex(a => a.userId === normalizedJid);
      if (idx === -1) {
        await sock.sendMessage(chatJid, { text: 'המשתמש הזה לא אדמין' });
        return;
      }
      if (admins.length <= 1) {
        await sock.sendMessage(chatJid, { text: 'אי אפשר להוריד את האדמין האחרון' });
        return;
      }
      const removedAdmin = admins.splice(idx, 1)[0];
      await saveAdmins(admins);
      await sock.sendMessage(chatJid, { text: `${removedAdmin.name} הוסר מהאדמינים ✅` });
      logger.info({ command: command.type, sender: senderJid, removedAdmin: normalizedJid }, 'Admin command executed');
      return; // No template save needed
    }

    case 'override_template': {
      const parsed = parseOverrideTemplate(command.rawText, template);
      if (!parsed) {
        await sock.sendMessage(chatJid, { text: 'לא הצלחתי לפענח את הרשימה. שלח רשימה ממוספרת (1. שם, 2. שם...)' });
        return;
      }
      template.slots = parsed.slots;
      template.waitingList = parsed.waitingList;
      break;
    }
  }

  await saveTemplate(template);
  const rendered = renderTemplate(template);
  await sock.sendMessage(chatJid, { text: rendered });
  logger.info({ command: command.type, sender: senderJid }, 'Admin command executed');
}

function parseOverrideTemplate(
  rawText: string,
  _currentTemplate: TemplateState,
): { slots: (PlayerSlot | null)[]; waitingList: PlayerSlot[] } | null {
  const lines = rawText.split('\n');
  const slots: (PlayerSlot | null)[] = new Array(24).fill(null);
  const waitingList: PlayerSlot[] = [];
  let foundAny = false;
  let inWaitingList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect waiting list section
    if (trimmed.includes('רשימת המתנה') || trimmed.includes('המתנה')) {
      inWaitingList = true;
      continue;
    }

    // Match numbered lines: "1. דוד כהן" or "1. דוד כהן (ציוד)" etc.
    const match = trimmed.match(/^(\d{1,2})\.\s*(.+)$/);
    if (!match) {
      // In waiting list section, unnumbered names
      if (inWaitingList && trimmed && !trimmed.startsWith('---')) {
        const cleanName = trimmed.replace(/\(.*?\)/g, '').replace(/\*/g, '').trim();
        if (cleanName && cleanName.split(/\s+/).length >= 2) {
          waitingList.push({ name: cleanName, userId: '', isLaundry: false, isEquipment: false });
          foundAny = true;
        }
      }
      continue;
    }

    const num = parseInt(match[1], 10);
    const content = match[2].trim();

    // Skip empty slots
    if (content === '___' || content === '_' || content === '') continue;

    // Parse name and tags
    const isEquipment = /ציוד/.test(content);
    const isLaundry = /כביסה/.test(content);
    const name = content.replace(/\(.*?\)/g, '').replace(/\*/g, '').trim();

    if (!name || name.split(/\s+/).length < 2) continue;

    const slotIndex = num - 1;
    if (slotIndex >= 0 && slotIndex < 24 && !inWaitingList) {
      slots[slotIndex] = { name, userId: '', isLaundry, isEquipment };
      foundAny = true;
    } else if (inWaitingList) {
      waitingList.push({ name, userId: '', isLaundry: false, isEquipment: false });
      foundAny = true;
    }
  }

  if (!foundAny) return null;
  return { slots, waitingList };
}

export async function overrideTemplateFromText(
  rawText: string,
): Promise<boolean> {
  const template = await loadTemplate();
  const parsed = parseOverrideTemplate(rawText, template);
  if (!parsed) return false;

  template.slots = parsed.slots;
  template.waitingList = parsed.waitingList;
  await saveTemplate(template);
  logger.info('Template overridden manually');
  return true;
}
