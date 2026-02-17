import type { TemplateState } from '../types.js';
import { formatHebrewDate } from '../utils/helpers.js';

export function renderTemplate(state: TemplateState): string {
  const date = formatHebrewDate(state.weekOf);
  const lines: string[] = [];

  lines.push(`כדורגל מוצ"ש ${date} ⚽🔥`);
  lines.push('');
  lines.push(`חימום: ${state.warmupTime} ⏰`);
  lines.push(`התחלה: ${state.startTime} 🕘`);
  lines.push(`התחייבות עד: ${state.commitmentTime} 🤝`);
  lines.push('');

  for (let i = 0; i < 24; i++) {
    const slot = state.slots[i];
    const num = i + 1;
    if (slot) {
      let label = slot.name;
      if (slot.isEquipment) label += ' (ציוד)';
      if (slot.isLaundry) label += ' (כביסה)';
      lines.push(`${num}. ${label}`);
    } else {
      lines.push(`${num}. ___`);
    }
  }

  if (state.waitingList.length > 0) {
    lines.push('');
    lines.push('--- רשימת המתנה ---');
    for (const player of state.waitingList) {
      lines.push(player.name);
    }
  }

  lines.push('');
  lines.push('1. *מי שלא כותב שם מלא לא נכנס לרשימה*');
  lines.push('2. *כל אחד יכול לרשום רק שם אחד*');
  lines.push('');
  lines.push('*כביסה מספר 24*');

  return lines.join('\n');
}
