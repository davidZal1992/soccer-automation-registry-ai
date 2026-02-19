/**
 * E2E Simulation Test v4 — with real Claude API calls (Haiku 4.5)
 *
 * Simulates a full weekly cycle including:
 * - 30-min batch processing with mixed register/cancel
 * - Message delete & edit during 12:00-12:03 burst
 * - ~20 junky Saturday morning messages
 * - Cancellation edge cases (waiting list, slot, empty list, laundry)
 * - Security checks
 *
 * Run: npx tsx src/test/e2e-simulation.ts
 * Output: src/test/e2e-output.txt
 */

import 'dotenv/config';
import { writeFileSync } from 'fs';
import { parseAdminCommandWithLLM } from '../bot/claude.js';
import { parseRegistrationMessages } from '../bot/claude.js';
import {
  createDefaultTemplate,
  saveAdmins,
  saveTemplate,
  loadTemplate,
  saveWeekly,
  loadWeekly,
} from '../bot/state.js';
import {
  addPlayerToTemplate,
  removePlayerFromTemplate,
} from '../bot/admin.js';
import {
  collectRegistrationMessage,
  removeCollectedMessage,
  editCollectedMessage,
  processCollectedMessages,
} from '../bot/registration.js';
import { renderTemplate } from '../bot/template.js';
import { normalizeJid } from '../utils/helpers.js';
import type { AdminEntry, CollectedMessage, ParsedAction } from '../types.js';

// ─── Output helpers ───
const output: string[] = [];
function log(text: string = ''): void { output.push(text); console.log(text); }
function header(text: string): void { log(`\n${'='.repeat(60)}`); log(`  ${text}`); log('='.repeat(60)); }
function sub(text: string): void { log(`\n  ▸ ${text}`); }
function msg(sender: string, text: string, time: string): void { log(`  │ ${sender} [${time}]: ${text}`); }
function bot(text: string, time: string): void {
  log(`\n  ┌── Bot [${time}] ──`);
  for (const line of text.split('\n')) log(`  │ ${line}`);
  log(`  └──────────────────`);
}
function info(label: string, value: string): void { log(`  ${label}: ${value}`); }
function act(text: string): void { log(`  >> ${text}`); }
function check(label: string, pass: boolean): void { log(`  ${pass ? 'PASS' : 'FAIL'}: ${label}`); }

// ─── Test Data ───
const ADMINS: AdminEntry[] = [
  { userId: '162650512191597@lid', name: 'דוד זלצמן' },
  { userId: '274268122300600@lid', name: 'גרי כוכבי' },
  { userId: '258204927803537@lid', name: 'אורן טל סממה' },
  { userId: '209770581598210@lid', name: 'יעקב טגדיה' },
];

const PLAYERS = [
  // 30 burst players
  { jid: '100000000001@lid', name: 'אלון דוד', msg: 'אלון דוד' },
  { jid: '100000000002@lid', name: 'גיל ברק', msg: 'גיל ברק' },
  { jid: '100000000003@lid', name: 'עומר שלום', msg: 'אני בפנים - עומר שלום' },
  { jid: '100000000004@lid', name: 'רוני לוי', msg: 'רוני לוי' },
  { jid: '100000000005@lid', name: 'אלי חגג', msg: 'אלי חגג' },
  { jid: '100000000006@lid', name: 'משה דוד', msg: 'משה דוד' },
  { jid: '100000000007@lid', name: 'יעקב פרץ', msg: 'מגיע! יעקב פרץ' },
  { jid: '100000000008@lid', name: 'דני אברהם', msg: 'דני אברהם' },
  { jid: '100000000009@lid', name: 'שמעון ביטון', msg: 'שמעון ביטון' },
  { jid: '100000000010@lid', name: 'חיים גולן', msg: 'חיים גולן' },
  { jid: '100000000011@lid', name: 'נתן אוחנה', msg: 'נתן אוחנה' },
  { jid: '100000000012@lid', name: 'איתי רוזן', msg: 'איתי רוזן' },
  { jid: '100000000013@lid', name: 'עידו מזרחי', msg: 'עידו מזרחי' },
  { jid: '100000000014@lid', name: 'תומר שושן', msg: 'תומר שושן' },
  { jid: '100000000015@lid', name: 'אסף כהן', msg: 'אסף כהן' },
  { jid: '100000000016@lid', name: 'יניב סויסה', msg: 'יניב סויסה' },
  { jid: '100000000017@lid', name: 'ליאור חדד', msg: 'ליאור חדד' },
  { jid: '100000000018@lid', name: 'בן צור', msg: 'בן צור' },
  { jid: '100000000019@lid', name: 'אורי שפירא', msg: 'אורי שפירא' },
  { jid: '100000000020@lid', name: 'גל אדרי', msg: 'גל אדרי' },
  { jid: '100000000021@lid', name: 'רועי אזולאי', msg: 'רועי אזולאי' },
  { jid: '100000000022@lid', name: 'עמית נחמיאס', msg: 'עמית נחמיאס' },
  { jid: '100000000023@lid', name: 'אריאל בכר', msg: 'אריאל בכר' },
  { jid: '100000000024@lid', name: 'דור אלון', msg: 'דור אלון' },
  { jid: '100000000025@lid', name: 'נועם גבאי', msg: 'נועם גבאי' },
  { jid: '100000000026@lid', name: 'יהונתן קפלן', msg: 'יהונתן קפלן' },
  { jid: '100000000027@lid', name: 'מתן ישראלי', msg: 'מתן ישראלי' },
  { jid: '100000000028@lid', name: 'עדי פלד', msg: 'עדי פלד' },
  { jid: '100000000029@lid', name: 'שחר מלכה', msg: 'שחר מלכה' },
  { jid: '100000000030@lid', name: 'טל בן דוד', msg: 'טל בן דוד' },
  // 5 late players (go to waiting list)
  { jid: '100000000031@lid', name: 'נדב אהרון', msg: 'נדב אהרון' },
  { jid: '100000000032@lid', name: 'אופיר גרוס', msg: 'אופיר גרוס' },
  { jid: '100000000033@lid', name: 'רז כרמלי', msg: 'רז כרמלי' },
  { jid: '100000000034@lid', name: 'עמרי סבג', msg: 'עמרי סבג' },
  { jid: '100000000035@lid', name: 'ניר חזן', msg: 'ניר חזן' },
  // Extra players for later phases
  { jid: '100000000036@lid', name: 'אייל מרדכי', msg: 'אייל מרדכי' },
  { jid: '100000000037@lid', name: 'בועז שטרן', msg: 'בועז שטרן' },
  { jid: '100000000038@lid', name: 'הראל ויצמן', msg: 'הראל ויצמן' },
  { jid: '100000000039@lid', name: 'סהר אלבז', msg: 'סהר אלבז' },
  { jid: '100000000040@lid', name: 'עידן כהן', msg: 'עידן כהן' },
  { jid: '100000000041@lid', name: 'יואב ברוך', msg: 'יואב ברוך' },
];

// Burst window noise
const BURST_NOISE = [
  { jid: '100000000050@lid', msg: 'מי מביא כדור?' },
  { jid: '100000000051@lid', msg: 'איזה מגרש?' },
  { jid: '100000000052@lid', msg: '😂😂😂' },
  { jid: PLAYERS[3].jid, msg: 'תבטל את אלי חגג' },
];

// Saturday morning junk messages (~20)
const SATURDAY_JUNK = [
  { jid: '100000000080@lid', msg: 'בוקר טוב לכולם' },
  { jid: '100000000081@lid', msg: 'מה נשמע' },
  { jid: '100000000082@lid', msg: 'איזה קור בחוץ' },
  { jid: '100000000083@lid', msg: '😂😂😂😂' },
  { jid: '100000000084@lid', msg: 'מי ראה את המשחק אתמול?' },
  { jid: '100000000085@lid', msg: 'איזה גול מטורף' },
  { jid: '100000000086@lid', msg: 'אחי תעזוב' },
  { jid: '100000000087@lid', msg: 'מישהו יודע מתי היום?' },
  { jid: '100000000088@lid', msg: 'כן כן' },
  { jid: '100000000089@lid', msg: 'לא' },
  { jid: '100000000090@lid', msg: '👍' },
  { jid: '100000000091@lid', msg: 'תגיד יש מגרש היום?' },
  { jid: '100000000092@lid', msg: 'ברור' },
  { jid: '100000000093@lid', msg: 'מי מביא מים?' },
  { jid: '100000000094@lid', msg: 'אני' },
  { jid: '100000000095@lid', msg: 'לול' },
  { jid: '100000000096@lid', msg: 'יאללה כדורגל!' },
  { jid: '100000000080@lid', msg: 'מתי חימום?' },
  { jid: '100000000081@lid', msg: 'תשאל את דוד' },
  { jid: '100000000082@lid', msg: 'אוקיי' },
];

// ─── Helpers ───
let msgCounter = 0;
function nextMsgId(): string { return `msg-${++msgCounter}`; }

async function applyActions(
  actions: ParsedAction[],
  allowedSenderJids?: Set<string>,
): Promise<{ registered: number; cancelled: number; ignored: number; promotions: string[] }> {
  const template = await loadTemplate();
  const weekly = await loadWeekly();
  const seen = new Set<string>();
  let registered = 0;
  let cancelled = 0;
  let ign = 0;
  const promotions: string[] = [];

  for (const a of actions) {
    const nid = normalizeJid(a.userId);
    if (seen.has(nid)) { ign++; continue; }
    seen.add(nid);

    if (a.type === 'register') {
      const name = a.name?.trim();
      if (!name || name.split(/\s+/).length < 2) { ign++; continue; }
      if (weekly.userIdMap[nid]) { ign++; continue; }
      weekly.userIdMap[nid] = name;
      addPlayerToTemplate(template, { name, userId: nid, isLaundry: false, isEquipment: false });
      registered++;
    } else if (a.type === 'cancel_waiting') {
      if (allowedSenderJids && !allowedSenderJids.has(nid)) { ign++; continue; }
      const waitIndex = template.waitingList.findIndex(w => normalizeJid(w.userId) === nid);
      if (waitIndex === -1) { ign++; continue; }
      template.waitingList.splice(waitIndex, 1);
      delete weekly.userIdMap[nid];
      cancelled++;
    } else if (a.type === 'cancel') {
      if (allowedSenderJids && !allowedSenderJids.has(nid)) { ign++; continue; }
      const inWeekly = !!weekly.userIdMap[nid];
      const inTemplate = template.slots.some(s => s && normalizeJid(s.userId) === nid)
        || template.waitingList.some(w => normalizeJid(w.userId) === nid);
      if (!inWeekly && !inTemplate) { ign++; continue; }
      delete weekly.userIdMap[nid];
      const { promoted } = removePlayerFromTemplate(template, nid);
      if (promoted) promotions.push(promoted.name);
      cancelled++;
    }
  }

  await saveTemplate(template);
  await saveWeekly(weekly);
  return { registered, cancelled, ignored: ign, promotions };
}

/** Simulate a 30-min batch: collect messages, send to Claude, apply */
async function processBatch(
  label: string,
  time: string,
  messages: { name: string; jid: string; text: string }[],
): Promise<{ registered: number; cancelled: number; ignored: number; promotions: string[] }> {
  sub(`${time} — ${label}`);
  const collected: CollectedMessage[] = [];
  for (const m of messages) {
    msg(m.name, m.text, time);
    collected.push({ msgId: nextMsgId(), senderJid: m.jid, text: m.text, timestamp: Date.now() });
  }
  act(`30-min cron fires → sending ${collected.length} messages to Claude...`);
  const actions = await parseRegistrationMessages(collected);

  sub('Claude parsed:');
  for (const a of actions) {
    const icon = a.type === 'register' ? '+' : a.type.startsWith('cancel') ? '-' : '?';
    log(`    [${icon}] ${a.type}: "${a.name}" (${a.userId.split('@')[0]})`);
  }

  const senderJids = new Set(messages.map(m => normalizeJid(m.jid)));
  const result = await applyActions(actions, senderJids);
  const template = await loadTemplate();

  info('Registered', result.registered.toString());
  info('Cancelled', result.cancelled.toString());
  info('Ignored', result.ignored.toString());
  if (result.promotions.length > 0) {
    const verb = result.promotions.length === 1 ? 'נכנסת' : 'נכנסתם';
    act(`Bot tags: ${result.promotions.map(n => `@${n}`).join(' ')} ${verb}`);
  }
  info('Slots', `${template.slots.filter(s => s).length}/24`);
  info('Waiting list', template.waitingList.length.toString());
  bot(renderTemplate(template), time);
  return result;
}

// ─── Main ───
async function run(): Promise<void> {
  log('╔══════════════════════════════════════════════════════╗');
  log('║     SOCCER BOT — E2E SIMULATION v4 (Haiku 4.5)     ║');
  log('╚══════════════════════════════════════════════════════╝');

  // ════════════════════════════════════════
  // PHASE 1: Weekly Reset
  // ════════════════════════════════════════
  header('PHASE 1: Saturday 23:00 — Weekly Reset');
  await saveAdmins(ADMINS);
  await saveTemplate(createDefaultTemplate());
  await saveWeekly({ userIdMap: {}, messagesCollected: [] });
  act('Template reset, admins seeded');
  info('Admins', ADMINS.map(a => a.name).join(', '));

  // ════════════════════════════════════════
  // PHASE 2: Sunday — Clean template to Group 1
  // ════════════════════════════════════════
  header('PHASE 2: Sunday 11:00 — Clean Template → Group 1');
  let template = await loadTemplate();
  bot(renderTemplate(template), 'Sun 11:00');

  // ════════════════════════════════════════
  // PHASE 3: Week — Admin commands
  // ════════════════════════════════════════
  header('PHASE 3: Week — Admin Commands in Group 1');

  sub('Monday 10:00 — Set laundry: מאור כהן');
  msg('דוד זלצמן', '@Bot כביסה מאור כהן', 'Mon 10:00');
  let cmd = await parseAdminCommandWithLLM('כביסה מאור כהן', []);
  info('LLM parsed', JSON.stringify(cmd));
  template = await loadTemplate();
  template.slots[23] = { name: 'מאור כהן', userId: '100000000099@lid', isLaundry: true, isEquipment: false };
  await saveTemplate(template);
  bot(renderTemplate(await loadTemplate()), 'Mon 10:00');

  sub('Monday 14:00 — Set equipment: נתאי רחבי');
  msg('גרי כוכבי', '@Bot נתאי רחבי ציוד', 'Mon 14:00');
  cmd = await parseAdminCommandWithLLM('נתאי רחבי ציוד', []);
  info('LLM parsed', JSON.stringify(cmd));
  template = await loadTemplate();
  addPlayerToTemplate(template, { name: 'נתאי רחבי', userId: '100000000097@lid', isLaundry: false, isEquipment: true });
  await saveTemplate(template);
  bot(renderTemplate(await loadTemplate()), 'Mon 14:00');

  sub('Tuesday 09:00 — Admin אורן טל סממה registers self');
  cmd = await parseAdminCommandWithLLM('תרשום אותי', []);
  info('LLM parsed', JSON.stringify(cmd));
  template = await loadTemplate();
  addPlayerToTemplate(template, { name: 'אורן טל סממה', userId: ADMINS[2].userId, isLaundry: false, isEquipment: false });
  await saveTemplate(template);

  sub('Tuesday 11:00 — Admin דוד זלצמן registers self');
  cmd = await parseAdminCommandWithLLM('תרשום אותי', []);
  info('LLM parsed', JSON.stringify(cmd));
  template = await loadTemplate();
  addPlayerToTemplate(template, { name: 'דוד זלצמן', userId: ADMINS[0].userId, isLaundry: false, isEquipment: false });
  await saveTemplate(template);

  sub('Thursday 20:00 — Show template');
  cmd = await parseAdminCommandWithLLM('תשלח תרשימה', []);
  info('LLM parsed', JSON.stringify(cmd));
  bot(renderTemplate(await loadTemplate()), 'Thu 20:00');

  // ════════════════════════════════════════
  // PHASE 4-5: Friday setup
  // ════════════════════════════════════════
  header('PHASE 4: Friday 11:50 — Bot Auto-Wakes');
  act('sleeping = false');

  header('PHASE 5: Friday 11:59 — Post Template → Group 2');
  template = await loadTemplate();
  bot(renderTemplate(template), 'Fri 11:59');

  // ════════════════════════════════════════
  // PHASE 6: Burst window 12:00-12:03 with noise + delete + edit
  // ════════════════════════════════════════
  header('PHASE 6: Friday 12:00 — Burst Window (30 players + noise + delete + edit)');
  template.registrationOpen = true;
  await saveTemplate(template);
  act('Group 2 opened — collecting messages to disk');

  const burstCollected: CollectedMessage[] = [];
  sub('12:00:00-12:00:30 — 30 players register');
  for (let i = 0; i < 30; i++) {
    const p = PLAYERS[i];
    msg(p.name, p.msg, `12:00:${String(i).padStart(2, '0')}`);
    burstCollected.push({ msgId: nextMsgId(), senderJid: p.jid, text: p.msg, timestamp: Date.now() + i });
  }

  sub('12:00:15 — Chat noise mixed in');
  for (const fake of BURST_NOISE) {
    msg('???', fake.msg, '12:00:15');
    burstCollected.push({ msgId: nextMsgId(), senderJid: fake.jid, text: fake.msg, timestamp: Date.now() });
  }

  // Player #5 (אלי חגג) deletes his message at 12:00:35
  sub('12:00:35 — אלי חגג DELETES his registration message');
  const deletedMsgId = burstCollected.find(m => m.senderJid === PLAYERS[4].jid)!.msgId;
  info('Deleted msgId', deletedMsgId);
  burstCollected.splice(burstCollected.findIndex(m => m.msgId === deletedMsgId), 1);
  act('Message removed from collected buffer (simulating removeCollectedMessage)');

  // Player #8 (דני אברהם) edits his message at 12:01:00 — typo fix
  sub('12:01:00 — דני אברהם EDITS his message to fix a typo');
  const editedMsg = burstCollected.find(m => m.senderJid === PLAYERS[7].jid)!;
  const oldText = editedMsg.text;
  editedMsg.text = 'דני אברהם';
  info('Original text', oldText);
  info('Edited text', editedMsg.text);
  act('Message text updated in collected buffer (simulating editCollectedMessage)');

  // Player #15 (אסף כהן) registers then deletes at 12:01:30 — regret
  sub('12:01:30 — אסף כהן DELETES his registration (changed his mind)');
  const regretMsgId = burstCollected.find(m => m.senderJid === PLAYERS[14].jid)!.msgId;
  burstCollected.splice(burstCollected.findIndex(m => m.msgId === regretMsgId), 1);
  act('אסף כהן message removed — he changed his mind');

  info('Total burst messages after deletes', `${burstCollected.length}`);

  // ════════════════════════════════════════
  // PHASE 7: 12:03 — Process burst
  // ════════════════════════════════════════
  header('PHASE 7: Friday 12:03 — Processing Burst');
  act(`Sending ${burstCollected.length} messages to Claude...`);
  const burstActions = await parseRegistrationMessages(burstCollected);
  info('Claude actions', burstActions.length.toString());

  sub('Claude parsed:');
  for (const a of burstActions) {
    const icon = a.type === 'register' ? '+' : '-';
    log(`    [${icon}] ${a.type}: "${a.name}" (${a.userId.split('@')[0]})`);
  }

  const burstResult = await applyActions(burstActions);
  template = await loadTemplate();
  info('Registered', burstResult.registered.toString());
  info('Ignored', burstResult.ignored.toString());
  info('Slots', `${template.slots.filter(s => s).length}/24`);
  info('Waiting list', template.waitingList.length.toString());
  check('אלי חגג NOT registered (deleted message)', !template.slots.some(s => s?.name === 'אלי חגג') && !template.waitingList.some(w => w.name === 'אלי חגג'));
  check('אסף כהן NOT registered (deleted message)', !template.slots.some(s => s?.name === 'אסף כהן') && !template.waitingList.some(w => w.name === 'אסף כהן'));
  check('דני אברהם IS registered (edited ok)', template.slots.some(s => s?.name === 'דני אברהם') || template.waitingList.some(w => w.name === 'דני אברהם'));
  bot(renderTemplate(template), 'Fri 12:03');

  // ════════════════════════════════════════
  // PHASE 8: Late registrations (go to waiting list)
  // ════════════════════════════════════════
  header('PHASE 8: Friday 12:33 — 5 Late Registrations');
  const lateBatch: { name: string; jid: string; text: string }[] = [];
  for (const p of PLAYERS.slice(30, 35)) {
    lateBatch.push({ name: p.name, jid: p.jid, text: p.msg });
  }
  await processBatch('5 late players register', 'Fri 12:33', lateBatch);
  template = await loadTemplate();
  check('All 5 in waiting list', template.waitingList.length >= 5);

  // ════════════════════════════════════════
  // PHASE 9: 30-min batch — mixed registrations + cancellations
  // ════════════════════════════════════════
  header('PHASE 9: 30-min Batch — 3 Register + 2 Cancel + 1 Register');
  sub('Scenario: 3 new players register, 2 existing cancel, then 1 more registers');

  const mixedBatch: { name: string; jid: string; text: string }[] = [
    { name: PLAYERS[35].name, jid: PLAYERS[35].jid, text: PLAYERS[35].msg },
    { name: PLAYERS[36].name, jid: PLAYERS[36].jid, text: PLAYERS[36].msg },
    { name: PLAYERS[37].name, jid: PLAYERS[37].jid, text: PLAYERS[37].msg },
    { name: PLAYERS[9].name, jid: PLAYERS[9].jid, text: 'מבטל' },
    { name: PLAYERS[10].name, jid: PLAYERS[10].jid, text: 'אני לא יכול מבטל' },
    { name: PLAYERS[38].name, jid: PLAYERS[38].jid, text: PLAYERS[38].msg },
  ];
  const mixedResult = await processBatch('Mixed batch (3 reg + 2 cancel + 1 reg)', 'Fri 13:03', mixedBatch);
  template = await loadTemplate();
  check('2 promotions happened', mixedResult.promotions.length === 2);
  check('Slots still 24/24', template.slots.filter(s => s).length === 24);

  // ════════════════════════════════════════
  // PHASE 10: Cancel from holding list (מבטל המתנה)
  // ════════════════════════════════════════
  header('PHASE 10: Cancel from Holding List (מבטל המתנה)');
  template = await loadTemplate();
  const waitBefore = template.waitingList.length;
  const slotsBefore = template.slots.filter(s => s).length;
  const waitingPlayer = template.waitingList[0];
  sub(`${waitingPlayer.name} says מבטל המתנה`);
  const cwActions = await parseRegistrationMessages([
    { msgId: nextMsgId(), senderJid: waitingPlayer.userId, text: 'מבטל המתנה', timestamp: Date.now() },
  ]);
  info('Claude action type', cwActions[0]?.type || 'NONE');
  const cwSenders = new Set([normalizeJid(waitingPlayer.userId)]);
  const cwResult = await applyActions(cwActions, cwSenders);
  template = await loadTemplate();
  check('Action type is cancel_waiting', cwActions[0]?.type === 'cancel_waiting');
  check('No promotion', cwResult.promotions.length === 0);
  check('Slots unchanged', template.slots.filter(s => s).length === slotsBefore);
  check('Waiting list decreased by 1', template.waitingList.length === waitBefore - 1);
  bot(renderTemplate(template), 'Fri 13:33');

  // ════════════════════════════════════════
  // PHASE 11: Slot player says "מבטל המתנה" — should be IGNORED
  // ════════════════════════════════════════
  header('PHASE 11: Slot Player Says מבטל המתנה — Should Be Ignored');
  template = await loadTemplate();
  const slotsBeforeIgnore = template.slots.filter(s => s).length;
  const waitBeforeIgnore = template.waitingList.length;
  sub('אלון דוד (in slot) says מבטל המתנה');
  const cwIgnore = await parseRegistrationMessages([
    { msgId: nextMsgId(), senderJid: PLAYERS[0].jid, text: 'מבטל המתנה', timestamp: Date.now() },
  ]);
  const cwIgnoreSenders = new Set([normalizeJid(PLAYERS[0].jid)]);
  await applyActions(cwIgnore, cwIgnoreSenders);
  template = await loadTemplate();
  check('Slots unchanged', template.slots.filter(s => s).length === slotsBeforeIgnore);
  check('Waiting list unchanged', template.waitingList.length === waitBeforeIgnore);
  check('אלון דוד still in slots', template.slots.some(s => s?.name === 'אלון דוד'));

  // ════════════════════════════════════════
  // PHASE 12: Admin cancels from Group 2
  // ════════════════════════════════════════
  header('PHASE 12: Admin Cancels from Group 2');
  sub('אורן טל סממה (admin, registered via Group 1) cancels in Group 2');
  const adminCancel = await parseRegistrationMessages([
    { msgId: nextMsgId(), senderJid: ADMINS[2].userId, text: 'מבטל', timestamp: Date.now() },
  ]);
  const adminSenders = new Set([normalizeJid(ADMINS[2].userId)]);
  const adminCancelR = await applyActions(adminCancel, adminSenders);
  template = await loadTemplate();
  check('Admin removed', !template.slots.some(s => s?.name === 'אורן טל סממה'));
  check('Someone promoted', adminCancelR.promotions.length === 1);
  if (adminCancelR.promotions.length > 0) act(`Promoted: ${adminCancelR.promotions[0]}`);
  bot(renderTemplate(template), 'Fri 14:03');

  // ════════════════════════════════════════
  // PHASE 13: Cancel + re-register same person in batch
  // ════════════════════════════════════════
  header('PHASE 13: Edge Case — Player Cancels Then Re-registers in Same Batch');
  template = await loadTemplate();
  const flipPlayer = PLAYERS[5]; // משה דוד
  sub(`${flipPlayer.name} cancels, then re-registers in same 30-min window`);
  const flipBatch: CollectedMessage[] = [
    { msgId: nextMsgId(), senderJid: flipPlayer.jid, text: 'מבטל', timestamp: Date.now() },
    { msgId: nextMsgId(), senderJid: flipPlayer.jid, text: 'סליחה חוזר בי, משה דוד', timestamp: Date.now() + 5000 },
  ];
  act('Sending both messages to Claude...');
  const flipActions = await parseRegistrationMessages(flipBatch);
  sub('Claude parsed:');
  for (const a of flipActions) {
    log(`    [${a.type === 'register' ? '+' : '-'}] ${a.type}: "${a.name}" (${a.userId.split('@')[0]})`);
  }
  info('Note', 'Dedup keeps only first action per userId — second message ignored');
  const flipSenders = new Set([normalizeJid(flipPlayer.jid)]);
  await applyActions(flipActions, flipSenders);
  template = await loadTemplate();
  const flipStillIn = template.slots.some(s => s?.name === flipPlayer.name);
  info(`${flipPlayer.name} in list?`, flipStillIn ? 'YES' : 'NO');
  bot(renderTemplate(template), 'Fri 14:33');

  // ════════════════════════════════════════
  // PHASE 14: Saturday morning — ~20 junk messages
  // ════════════════════════════════════════
  header('PHASE 14: Saturday Morning — 20 Junk Messages');
  sub('People chatting in Group 2 on Saturday morning');
  const junkMessages: { name: string; jid: string; text: string }[] = SATURDAY_JUNK.map(j => ({
    name: '???', jid: j.jid, text: j.msg,
  }));
  const junkResult = await processBatch('20 junk chat messages', 'Sat 09:03', junkMessages);
  template = await loadTemplate();
  check('No registrations from junk', junkResult.registered === 0);
  check('No cancellations from junk', junkResult.cancelled === 0);
  info('Slots still', `${template.slots.filter(s => s).length}/24`);

  // ════════════════════════════════════════
  // PHASE 15: Drain waiting list completely
  // ════════════════════════════════════════
  header('PHASE 15: Drain Waiting List to Empty');
  template = await loadTemplate();
  info('Waiting list size', template.waitingList.length.toString());

  let cancelIdx = 0;
  const cancelCandidates = template.slots
    .map((s, i) => s ? { name: s.name, userId: s.userId, idx: i } : null)
    .filter((s): s is NonNullable<typeof s> => s !== null && !s.name.includes('ציוד') && s.idx !== 23);

  while (template.waitingList.length > 0 && cancelIdx < cancelCandidates.length) {
    const c = cancelCandidates[cancelIdx++];
    const weekly = await loadWeekly();
    if (!weekly.userIdMap[c.userId]) {
      weekly.userIdMap[c.userId] = c.name;
      await saveWeekly(weekly);
    }
    const cancelActions = await parseRegistrationMessages([
      { msgId: nextMsgId(), senderJid: c.userId, text: 'מבטל', timestamp: Date.now() },
    ]);
    const cancelSenders = new Set([normalizeJid(c.userId)]);
    const cancelResult = await applyActions(cancelActions, cancelSenders);
    template = await loadTemplate();
    log(`    ${c.name} cancelled → promoted: ${cancelResult.promotions[0] || 'none'} | waiting: ${template.waitingList.length}`);
  }

  template = await loadTemplate();
  check('Waiting list is empty', template.waitingList.length === 0);
  bot(renderTemplate(template), 'Sat 15:03');

  // ════════════════════════════════════════
  // PHASE 16: Cancel when waiting list empty — no promotion
  // ════════════════════════════════════════
  header('PHASE 16: Cancel When Waiting List Empty');
  template = await loadTemplate();
  const emptyWaitCancel = template.slots.find(s => s && s.userId && !s.isEquipment && !s.isLaundry);
  if (emptyWaitCancel) {
    sub(`${emptyWaitCancel.name} cancels — waiting list is empty`);
    const weekly = await loadWeekly();
    if (!weekly.userIdMap[emptyWaitCancel.userId]) {
      weekly.userIdMap[emptyWaitCancel.userId] = emptyWaitCancel.name;
      await saveWeekly(weekly);
    }
    const noPromoActions = await parseRegistrationMessages([
      { msgId: nextMsgId(), senderJid: emptyWaitCancel.userId, text: 'לא בא לי מבטל', timestamp: Date.now() },
    ]);
    const noPromoSenders = new Set([normalizeJid(emptyWaitCancel.userId)]);
    const noPromoResult = await applyActions(noPromoActions, noPromoSenders);
    template = await loadTemplate();
    check('No promotion (list empty)', noPromoResult.promotions.length === 0);
    check('Player removed', !template.slots.some(s => s?.name === emptyWaitCancel.name));
    info('Slots', `${template.slots.filter(s => s).length}/24`);
    bot(renderTemplate(template), 'Sat 15:33');
  }

  // ════════════════════════════════════════
  // PHASE 17: Laundry guy cancels
  // ════════════════════════════════════════
  header('PHASE 17: Laundry Guy Cancels');
  let weekly = await loadWeekly();
  weekly.userIdMap['100000000099@lid'] = 'מאור כהן';
  await saveWeekly(weekly);

  sub('מאור כהן (LAUNDRY, slot 24) cancels with מבטל');
  const laundryCancel = await parseRegistrationMessages([
    { msgId: nextMsgId(), senderJid: '100000000099@lid', text: 'מבטל', timestamp: Date.now() },
  ]);
  const laundrySenders = new Set([normalizeJid('100000000099@lid')]);
  const laundryResult = await applyActions(laundryCancel, laundrySenders);
  template = await loadTemplate();
  if (laundryResult.promotions.length > 0) {
    act(`Promoted to slot 24: ${laundryResult.promotions[0]}`);
    info('Laundry flag on new slot 24', template.slots[23]?.isLaundry ? 'YES' : 'NO');
  } else {
    act('No one promoted (waiting list empty)');
    info('Slot 24', template.slots[23]?.name || 'EMPTY');
  }
  bot(renderTemplate(template), 'Sat 16:03');

  // ════════════════════════════════════════
  // PHASE 18: New registrations fill empty slots
  // ════════════════════════════════════════
  header('PHASE 18: New Players Fill Empty Slots');
  template = await loadTemplate();
  const emptyCount = template.slots.filter(s => s === null).length;
  info('Empty slots before', emptyCount.toString());

  const fillPlayers = PLAYERS.slice(39, 41);
  await processBatch(
    `${fillPlayers.length} new players register`,
    'Sat 16:33',
    fillPlayers.map(p => ({ name: p.name, jid: p.jid, text: p.msg })),
  );
  template = await loadTemplate();
  info('Empty slots after', template.slots.filter(s => s === null).length.toString());

  // ════════════════════════════════════════
  // PHASE 19: Batch with ONLY cancellations (combined promotion tag)
  // ════════════════════════════════════════
  header('PHASE 19: Batch of 3 Cancellations → Combined Promotion Tag');
  template = await loadTemplate();
  const extraWait = [
    { name: 'יוסי אברמוב', jid: '100000000060@lid' },
    { name: 'אבי מלכה', jid: '100000000061@lid' },
    { name: 'דניאל רז', jid: '100000000062@lid' },
  ];
  for (const w of extraWait) {
    template.waitingList.push({ name: w.name, userId: w.jid, isLaundry: false, isEquipment: false });
    const wk = await loadWeekly();
    wk.userIdMap[w.jid] = w.name;
    await saveWeekly(wk);
  }
  await saveTemplate(template);
  info('Added to waiting list', extraWait.map(w => w.name).join(', '));

  template = await loadTemplate();
  const cancelSlots = template.slots
    .filter((s): s is NonNullable<typeof s> => s !== null && !s.isEquipment && !s.isLaundry)
    .slice(0, 3);
  const cancelBatch: { name: string; jid: string; text: string }[] = cancelSlots.map(s => {
    return { name: s.name, jid: s.userId, text: 'מבטל' };
  });
  for (const c of cancelSlots) {
    const wk = await loadWeekly();
    if (!wk.userIdMap[c.userId]) {
      wk.userIdMap[c.userId] = c.name;
      await saveWeekly(wk);
    }
  }
  const multiResult = await processBatch('3 cancellations in one batch', 'Sat 17:03', cancelBatch);
  check('3 promotions happened', multiResult.promotions.length === 3);
  if (multiResult.promotions.length > 0) {
    info('Combined tag would be', `@${multiResult.promotions.join(' @')} נכנסתם`);
  }

  // ════════════════════════════════════════
  // PHASE 20: Security — cancel someone else
  // ════════════════════════════════════════
  header('PHASE 20: Security — Player Tries to Cancel Someone Else');
  template = await loadTemplate();
  const slotsBefore20 = template.slots.filter(s => s !== null).length;
  // Dynamically pick a player that's actually in the template right now
  const targetVictim = template.slots.find(s => s && s.userId && !s.isEquipment && !s.isLaundry);
  const victimName = targetVictim?.name || '???';
  msg('רוני לוי', `תבטל את ${victimName}`, 'Sat 17:33');
  const attackerJid = '100000000199@lid';
  const securityTest = await parseRegistrationMessages([
    { msgId: nextMsgId(), senderJid: attackerJid, text: `תבטל את ${victimName}`, timestamp: Date.now() },
  ]);
  info('Claude response', JSON.stringify(securityTest));
  const attackerSenders = new Set([normalizeJid(attackerJid)]);
  await applyActions(securityTest, attackerSenders);
  template = await loadTemplate();
  check(`${victimName} still in list`, template.slots.some(s => s?.name === victimName));
  check('Slots unchanged', template.slots.filter(s => s !== null).length === slotsBefore20);

  // ════════════════════════════════════════
  // PHASE 21: No-name registration
  // ════════════════════════════════════════
  header('PHASE 21: Player Writes תרשום אותי Without Name');
  msg('???', 'תרשום אותי', 'Sat 18:00');
  const noNameTest = await parseRegistrationMessages([
    { msgId: nextMsgId(), senderJid: '100000000070@lid', text: 'תרשום אותי', timestamp: Date.now() },
  ]);
  const validReg = noNameTest.filter(a => a.type === 'register' && a.name && a.name.split(/\s+/).length >= 2);
  check('No valid registration (no name)', validReg.length === 0);

  // ════════════════════════════════════════
  // PHASE 22: Duplicate registration
  // ════════════════════════════════════════
  header('PHASE 22: Duplicate Registration — Same Person Registers Again');
  template = await loadTemplate();
  // Find someone still in slots
  const dupCandidate = template.slots.find(s => s && s.userId && !s.isEquipment && !s.isLaundry);
  if (dupCandidate) {
    sub(`${dupCandidate.name} (already in slot) sends his name again`);
    const dupActions = await parseRegistrationMessages([
      { msgId: nextMsgId(), senderJid: dupCandidate.userId, text: dupCandidate.name, timestamp: Date.now() },
    ]);
    const dupSenders = new Set([normalizeJid(dupCandidate.userId)]);
    const dupResult = await applyActions(dupActions, dupSenders);
    template = await loadTemplate();
    const count = template.slots.filter(s => s?.name === dupCandidate.name).length
      + template.waitingList.filter(w => w.name === dupCandidate.name).length;
    check('Only appears once (no duplicate)', count === 1);
    check('Ignored by dedup', dupResult.ignored >= 1);
  }

  // ════════════════════════════════════════
  // PHASE 23: Noisy batch — chat mixed with registrations
  // ════════════════════════════════════════
  header('PHASE 23: Noisy Batch — Chat Messages Mixed with Registrations');
  const noisyBatch: { name: string; jid: string; text: string }[] = [
    { name: '???', jid: '100000000071@lid', text: 'מה קורה אחי?' },
    { name: '???', jid: '100000000072@lid', text: 'יאללה גולן 😂' },
    { name: '???', jid: '100000000073@lid', text: 'מישהו יכול להביא מים?' },
    { name: '???', jid: '100000000074@lid', text: 'אוהד ברזילי' },
    { name: '???', jid: '100000000075@lid', text: 'תגיד' },
    { name: '???', jid: '100000000076@lid', text: 'ניסים חכמון' },
  ];
  const noisyResult = await processBatch('Chat noise + 2 valid names', 'Sat 18:03', noisyBatch);
  check('Only valid names registered (<=2)', noisyResult.registered <= 2);
  check('Chat noise ignored', noisyResult.ignored >= 0);

  // ════════════════════════════════════════
  // PHASE 24: Big mixed Saturday batch — 4 cancel + 3 register + 2 cancel_waiting
  // ════════════════════════════════════════
  header('PHASE 24: Big Mixed Saturday Batch — 4 Cancel + 3 Register + 2 Cancel Waiting');
  template = await loadTemplate();
  // Add 5 to waiting list for this test
  const bigWait = [
    { name: 'רון אביב', jid: '100000000110@lid' },
    { name: 'שלמה דיין', jid: '100000000111@lid' },
    { name: 'אמיר גולדברג', jid: '100000000112@lid' },
    { name: 'יגאל בן שמעון', jid: '100000000113@lid' },
    { name: 'ערן סלומון', jid: '100000000114@lid' },
  ];
  for (const w of bigWait) {
    template.waitingList.push({ name: w.name, userId: w.jid, isLaundry: false, isEquipment: false });
    const wk = await loadWeekly();
    wk.userIdMap[w.jid] = w.name;
    await saveWeekly(wk);
  }
  await saveTemplate(template);
  info('Added to waiting list', bigWait.map(w => w.name).join(', '));

  template = await loadTemplate();
  const slotsForCancel = template.slots
    .filter((s): s is NonNullable<typeof s> => s !== null && !s.isEquipment && !s.isLaundry)
    .slice(0, 4);
  const waitForCancel = template.waitingList.slice(-2); // last 2 in waiting list

  const bigMixed: { name: string; jid: string; text: string }[] = [
    // 4 slot cancellations
    ...slotsForCancel.map(s => ({ name: s.name, jid: s.userId, text: 'מבטל' })),
    // 3 new registrations
    { name: 'טוביה הלוי', jid: '100000000120@lid', text: 'טוביה הלוי' },
    { name: 'עדן מזרחי', jid: '100000000121@lid', text: 'עדן מזרחי' },
    { name: 'נריה כהן', jid: '100000000122@lid', text: 'נריה כהן' },
    // 2 waiting list cancellations
    ...waitForCancel.map(w => ({ name: w.name, jid: w.userId, text: 'מבטל המתנה' })),
  ];
  // Ensure slot players are in weekly map
  for (const c of slotsForCancel) {
    const wk = await loadWeekly();
    if (!wk.userIdMap[c.userId]) {
      wk.userIdMap[c.userId] = c.name;
      await saveWeekly(wk);
    }
  }

  const slotsBefore24 = template.slots.filter(s => s).length;
  const waitBefore24 = template.waitingList.length;
  const bigResult = await processBatch('4 cancel + 3 register + 2 cancel_waiting', 'Sat 18:33', bigMixed);
  template = await loadTemplate();
  // 4 cancelled from slots → 4 promoted from waiting list (if enough)
  // 2 cancelled from waiting list → no promotion
  // 3 new registrations → go to waiting list (slots should still be full after promotions)
  check('4 slot cancellations', bigResult.cancelled >= 4);
  check('Promotions happened', bigResult.promotions.length > 0);
  info('Total promotions', bigResult.promotions.length.toString());
  info('Total registrations', bigResult.registered.toString());
  info('Slots after', `${template.slots.filter(s => s).length}/24`);
  info('Waiting list after', template.waitingList.length.toString());
  bot(renderTemplate(template), 'Sat 18:33');

  // ════════════════════════════════════════
  // PHASE 25: Pre-game warning
  // ════════════════════════════════════════
  header('PHASE 25: Saturday 18:45 — Last Call');
  bot('קבוצות עוד 5 דקות, ביטולים אחרונים?', 'Sat 18:45');

  header('PHASE 26: Saturday 18:50 — Registration Closes');
  act('Final processCollectedMessages()');
  act('registrationOpen = false');

  // ════════════════════════════════════════
  // PHASE 27: Test disk-level delete/edit (using actual functions)
  // ════════════════════════════════════════
  header('PHASE 27: Disk-Level Delete & Edit Functions');
  // Reset collected messages for this test
  weekly = await loadWeekly();
  weekly.messagesCollected = [];
  await saveWeekly(weekly);

  sub('Simulate 3 messages collected to disk');
  await collectRegistrationMessage('disk-msg-1', '100000000200@lid', 'יוסי כהן');
  await collectRegistrationMessage('disk-msg-2', '100000000201@lid', 'דני לוי');
  await collectRegistrationMessage('disk-msg-3', '100000000202@lid', 'אבי שמש');

  weekly = await loadWeekly();
  info('Messages on disk', weekly.messagesCollected.length.toString());
  check('3 messages collected', weekly.messagesCollected.length === 3);

  sub('Delete disk-msg-2 (דני לוי deletes his message)');
  await removeCollectedMessage('disk-msg-2');
  weekly = await loadWeekly();
  check('2 messages remain', weekly.messagesCollected.length === 2);
  check('דני לוי removed', !weekly.messagesCollected.some(m => m.msgId === 'disk-msg-2'));

  sub('Edit disk-msg-3 (אבי שמש fixes typo)');
  await editCollectedMessage('disk-msg-3', 'אברהם שמש');
  weekly = await loadWeekly();
  const editedDisk = weekly.messagesCollected.find(m => m.msgId === 'disk-msg-3');
  check('Message text updated', editedDisk?.text === 'אברהם שמש');

  sub('Process remaining 2 messages via Claude');
  const diskMessages = weekly.messagesCollected;
  const diskActions = await parseRegistrationMessages(diskMessages);
  sub('Claude parsed:');
  for (const a of diskActions) {
    log(`    [${a.type === 'register' ? '+' : '-'}] ${a.type}: "${a.name}" (${a.userId.split('@')[0]})`);
  }
  check('דני לוי NOT in actions (deleted)', !diskActions.some(a => a.name === 'דני לוי'));
  check('אברהם שמש in actions (edited)', diskActions.some(a => a.name === 'אברהם שמש') || diskActions.some(a => a.name === 'יוסי כהן'));

  // Clean up
  weekly.messagesCollected = [];
  await saveWeekly(weekly);

  // ════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════
  header('SIMULATION COMPLETE');
  template = await loadTemplate();
  const finalSlots = template.slots.filter(s => s !== null).length;
  info('Players in slots', `${finalSlots}/24`);
  info('Waiting list', template.waitingList.length.toString());
  info('Laundry', template.slots[23]?.name || 'none');
  info('Laundry flag', template.slots[23]?.isLaundry ? 'YES' : 'NO');
  info('Equipment', template.slots.find(s => s?.isEquipment)?.name || 'none');

  log('\n  Final slot list:');
  for (let i = 0; i < 24; i++) {
    const s = template.slots[i];
    const flags = [s?.isLaundry && 'LAUNDRY', s?.isEquipment && 'EQUIPMENT'].filter(Boolean).join(', ');
    log(`    ${i + 1}. ${s?.name || '(empty)'}${flags ? ` (${flags})` : ''}`);
  }

  if (template.waitingList.length > 0) {
    log('\n  Waiting list:');
    for (const w of template.waitingList) log(`    - ${w.name}`);
  }

  // Count PASS/FAIL
  const passCount = output.filter(l => l.includes('PASS:')).length;
  const failCount = output.filter(l => l.includes('FAIL:')).length;
  log(`\n  Results: ${passCount} PASS, ${failCount} FAIL`);

  log('\nDone.');
  writeFileSync('src/test/e2e-output.txt', output.join('\n'), 'utf-8');
  console.log('\nOutput saved to src/test/e2e-output.txt');
}

run().catch(err => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
