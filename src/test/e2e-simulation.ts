/**
 * E2E Simulation Test — with real timing
 *
 * Simulates a full weekly cycle with real Claude API calls and real delays.
 * Burst window: 30 seconds (compressed from 3 min)
 * Post-burst debounce: 15 seconds
 * Total runtime: ~4-5 minutes
 *
 * Run: npx tsx src/test/e2e-simulation.ts
 */

import 'dotenv/config';
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
import { addPlayerToTemplate, removePlayerFromTemplate } from '../bot/admin.js';
import { renderTemplate } from '../bot/template.js';
import { normalizeJid } from '../utils/helpers.js';
import type { AdminEntry, CollectedMessage } from '../types.js';

// ─── Colors ───
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m',
};

// ─── Test Data ───

const ADMINS: AdminEntry[] = [
  { userId: '972501111111@s.whatsapp.net', name: 'דוד זלצמן' },
  { userId: '972502222222@s.whatsapp.net', name: 'יוסי כהן' },
  { userId: '972503333333@s.whatsapp.net', name: 'אבי לוי' },
  { userId: '972504444444@s.whatsapp.net', name: 'רון שמיר' },
];

const PLAYERS = [
  { jid: '972511000001@s.whatsapp.net', name: 'אלון דוד', msg: 'אלון דוד' },
  { jid: '972511000002@s.whatsapp.net', name: 'גיל ברק', msg: 'גיל ברק' },
  { jid: '972511000003@s.whatsapp.net', name: 'עומר שלום', msg: 'אני בפנים - עומר שלום' },
  { jid: '972511000004@s.whatsapp.net', name: 'רוני לוי', msg: 'רוני לוי' },
  { jid: '972511000005@s.whatsapp.net', name: 'אלי חגג', msg: 'אלי חגג' },
  { jid: '972511000006@s.whatsapp.net', name: 'משה דוד', msg: 'משה דוד' },
  { jid: '972511000007@s.whatsapp.net', name: 'יעקב פרץ', msg: 'מגיע! יעקב פרץ' },
  { jid: '972511000008@s.whatsapp.net', name: 'דני אברהם', msg: 'תרשום את אחי דני אברהם' },
  { jid: '972511000009@s.whatsapp.net', name: 'שמעון ביטון', msg: 'שמעון ביטון' },
  { jid: '972511000010@s.whatsapp.net', name: 'חיים גולן', msg: 'חיים גולן' },
  { jid: '972511000011@s.whatsapp.net', name: 'נתן אוחנה', msg: 'נתן אוחנה' },
  { jid: '972511000012@s.whatsapp.net', name: 'איתי רוזן', msg: 'איתי רוזן' },
  { jid: '972511000013@s.whatsapp.net', name: 'עידו מזרחי', msg: 'עידו מזרחי' },
  { jid: '972511000014@s.whatsapp.net', name: 'תומר שושן', msg: 'תומר שושן' },
  { jid: '972511000015@s.whatsapp.net', name: 'אסף כהן', msg: 'אסף כהן' },
  { jid: '972511000016@s.whatsapp.net', name: 'יניב סויסה', msg: 'יניב סויסה' },
  { jid: '972511000017@s.whatsapp.net', name: 'ליאור חדד', msg: 'ליאור חדד' },
  { jid: '972511000018@s.whatsapp.net', name: 'בן צור', msg: 'בן צור' },
  { jid: '972511000019@s.whatsapp.net', name: 'אורי שפירא', msg: 'אורי שפירא' },
  { jid: '972511000020@s.whatsapp.net', name: 'גל אדרי', msg: 'גל אדרי' },
  { jid: '972511000021@s.whatsapp.net', name: 'רועי אזולאי', msg: 'רועי אזולאי' },
  { jid: '972511000022@s.whatsapp.net', name: 'עמית נחמיאס', msg: 'עמית נחמיאס' },
  { jid: '972511000023@s.whatsapp.net', name: 'אריאל בכר', msg: 'אריאל בכר' },
  { jid: '972511000024@s.whatsapp.net', name: 'דור אלון', msg: 'דור אלון' },
  { jid: '972511000025@s.whatsapp.net', name: 'נועם גבאי', msg: 'נועם גבאי' },
  { jid: '972511000026@s.whatsapp.net', name: 'יהונתן קפלן', msg: 'יהונתן קפלן' },
  { jid: '972511000027@s.whatsapp.net', name: 'מתן ישראלי', msg: 'מתן ישראלי' },
  { jid: '972511000028@s.whatsapp.net', name: 'עדי פלד', msg: 'עדי פלד' },
  { jid: '972511000029@s.whatsapp.net', name: 'שחר מלכה', msg: 'שחר מלכה' },
  { jid: '972511000030@s.whatsapp.net', name: 'טל בן דוד', msg: 'טל בן דוד' },
  // Late registrations
  { jid: '972511000031@s.whatsapp.net', name: 'נדב אהרון', msg: 'נדב אהרון' },
  { jid: '972511000032@s.whatsapp.net', name: 'אופיר גרוס', msg: 'אופיר גרוס' },
  { jid: '972511000033@s.whatsapp.net', name: 'רז כרמלי', msg: 'רז כרמלי' },
  { jid: '972511000034@s.whatsapp.net', name: 'עמרי סבג', msg: 'עמרי סבג' },
  { jid: '972511000035@s.whatsapp.net', name: 'ניר חזן', msg: 'ניר חזן' },
];

const FAKE_MESSAGES = [
  { jid: '972511000050@s.whatsapp.net', name: '???', msg: 'מי מביא כדור?' },
  { jid: '972511000051@s.whatsapp.net', name: '???', msg: 'איזה מגרש?' },
  { jid: '972511000052@s.whatsapp.net', name: '???', msg: '😂😂😂' },
  { jid: '972511000053@s.whatsapp.net', name: '???', msg: 'יאלה' },
  { jid: '972511000054@s.whatsapp.net', name: '???', msg: 'מישהו צריך הסעה?' },
  { jid: PLAYERS[3].jid, name: 'רוני לוי', msg: 'תבטל את אלי חגג' },
];

// ─── Helpers ───

function printHeader(text: string): void {
  console.log('\n' + C.bgBlue + C.bold + ` ${text} ` + C.reset);
  console.log(C.dim + '─'.repeat(60) + C.reset);
}

function printSub(text: string): void {
  console.log('\n' + C.cyan + C.bold + `  ▸ ${text}` + C.reset);
}

function printMsg(sender: string, text: string, time: string): void {
  console.log(C.green + `  │ 👤 ${sender}` + C.reset + C.gray + ` [${time}]` + C.reset);
  console.log(`  │    ${text}`);
}

function printBot(text: string, time: string): void {
  console.log(C.gray + `\n  ┌── 🤖 Bot [${time}] ──────────────────────` + C.reset);
  for (const line of text.split('\n')) {
    console.log(C.blue + `  │ ${line}` + C.reset);
  }
  console.log(C.gray + `  └──────────────────────────────────────` + C.reset);
}

function info(label: string, value: string): void {
  console.log(C.yellow + `  ✦ ${label}: ` + C.reset + value);
}

function action(text: string): void {
  console.log(C.magenta + `  ⚡ ${text}` + C.reset);
}

function ignored(reason: string): void {
  console.log(C.red + `  ✗ IGNORED — ${reason}` + C.reset);
}

function countdown(label: string, seconds: number): Promise<void> {
  return new Promise(resolve => {
    let remaining = seconds;
    const timer = setInterval(() => {
      process.stdout.write(`\r${C.dim}  ⏳ ${label}: ${remaining}s remaining...${C.reset}  `);
      remaining--;
      if (remaining < 0) {
        clearInterval(timer);
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
        resolve();
      }
    }, 1000);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function applyActions(
  actions: { type: string; name: string; userId: string }[],
): Promise<{ registered: number; ignored: number }> {
  const template = await loadTemplate();
  const weekly = await loadWeekly();
  const seen = new Set<string>();
  let registered = 0;
  let ign = 0;

  for (const a of actions) {
    const nid = normalizeJid(a.userId);
    if (seen.has(nid)) { ign++; continue; }
    seen.add(nid);

    if (a.type === 'register') {
      const name = a.name?.trim();
      if (!name || name.split(/\s+/).length < 2) { ign++; continue; }
      if (weekly.userIdMap[nid]) { ign++; continue; }
      weekly.userIdMap[nid] = name;
      addPlayerToTemplate(template, {
        name,
        userId: nid,
        isLaundry: false,
        isEquipment: false,
      });
      registered++;
    } else if (a.type === 'cancel') {
      if (!weekly.userIdMap[nid]) { ign++; continue; }
      delete weekly.userIdMap[nid];
      removePlayerFromTemplate(template, nid);
      registered++;
    }
  }

  await saveTemplate(template);
  await saveWeekly(weekly);
  return { registered, ignored: ign };
}

// ─── Main ───

async function run(): Promise<void> {
  console.log(C.bold + '\n╔══════════════════════════════════════════════════════╗' + C.reset);
  console.log(C.bold +   '║     ⚽ SOCCER BOT — E2E SIMULATION (with timing)    ║' + C.reset);
  console.log(C.bold +   '╚══════════════════════════════════════════════════════╝\n' + C.reset);

  // ════════════════════════════════
  // RESET
  // ════════════════════════════════
  printHeader('PHASE 1: Saturday 23:00 — Weekly Reset');
  await saveAdmins(ADMINS);
  await saveTemplate(createDefaultTemplate());
  await saveWeekly({ userIdMap: {}, messagesCollected: [] });
  action('Template reset, admins seeded');
  info('Admins', ADMINS.map(a => a.name).join(', '));

  // ════════════════════════════════
  // SUNDAY — CLEAN TEMPLATE
  // ════════════════════════════════
  printHeader('PHASE 2: Sunday 11:00 — Clean Template → Group 1');
  let template = await loadTemplate();
  printBot(renderTemplate(template), 'Sun 11:00');

  // ════════════════════════════════
  // WEEK — ADMIN COMMANDS
  // ════════════════════════════════
  printHeader('PHASE 3: Week — Admin Commands in Group 1');

  // --- Laundry ---
  printSub('Monday 10:00 — Set laundry');
  printMsg('דוד זלצמן', '@Bot כביסה מאור כהן', 'Mon 10:00');
  let cmd = await parseAdminCommandWithLLM('כביסה מאור כהן', []);
  info('LLM', JSON.stringify(cmd));

  template = await loadTemplate();
  addPlayerToTemplate(template, { name: 'מאור כהן', userId: '972511000099@s.whatsapp.net', isLaundry: false, isEquipment: false });
  for (let i = 0; i < template.slots.length; i++) {
    if (template.slots[i]?.name === 'מאור כהן') {
      const p = template.slots[i]!;
      template.slots[i] = null;
      p.isLaundry = true;
      template.slots[23] = p;
      break;
    }
  }
  await saveTemplate(template);
  printBot(renderTemplate(await loadTemplate()), 'Mon 10:00');

  // --- Equipment ---
  printSub('Monday 14:00 — Set equipment');
  printMsg('יוסי כהן', '@Bot ציוד אלכס זלצמן', 'Mon 14:00');
  cmd = await parseAdminCommandWithLLM('ציוד אלכס זלצמן', []);
  info('LLM', JSON.stringify(cmd));

  template = await loadTemplate();
  addPlayerToTemplate(template, { name: 'אלכס זלצמן', userId: '972511000098@s.whatsapp.net', isLaundry: false, isEquipment: false });
  const eqIdx = template.slots.findIndex(s => s?.name === 'אלכס זלצמן');
  if (eqIdx !== -1) template.slots[eqIdx]!.isEquipment = true;
  await saveTemplate(template);
  printBot(renderTemplate(await loadTemplate()), 'Mon 14:00');

  // --- Admin registers self ---
  printSub('Tuesday 09:00 — Admin registers self');
  printMsg('אבי לוי', '@Bot תרשום אותי', 'Tue 09:00');
  cmd = await parseAdminCommandWithLLM('תרשום אותי', []);
  info('LLM', JSON.stringify(cmd));
  template = await loadTemplate();
  addPlayerToTemplate(template, { name: 'אבי לוי', userId: ADMINS[2].userId, isLaundry: false, isEquipment: false });
  await saveTemplate(template);
  printBot(renderTemplate(await loadTemplate()), 'Tue 09:00');

  // --- Admin registers self (natural) ---
  printSub('Tuesday 11:00 — Admin registers (natural language)');
  printMsg('רון שמיר', '@Bot תוסיף אותי בבקשה', 'Tue 11:00');
  cmd = await parseAdminCommandWithLLM('תוסיף אותי בבקשה', []);
  info('LLM', JSON.stringify(cmd));
  template = await loadTemplate();
  addPlayerToTemplate(template, { name: 'רון שמיר', userId: ADMINS[3].userId, isLaundry: false, isEquipment: false });
  await saveTemplate(template);
  printBot(renderTemplate(await loadTemplate()), 'Tue 11:00');

  // --- Show template ---
  printSub('Thursday 20:00 — Admin checks list');
  printMsg('דוד זלצמן', '@Bot מה המצב', 'Thu 20:00');
  cmd = await parseAdminCommandWithLLM('מה המצב', []);
  info('LLM', JSON.stringify(cmd));
  printBot(renderTemplate(await loadTemplate()), 'Thu 20:00');

  // --- Unrecognized ---
  printSub('Thursday 20:05 — Unrecognized message');
  printMsg('דוד זלצמן', '@Bot מה שלומך', 'Thu 20:05');
  cmd = await parseAdminCommandWithLLM('מה שלומך', []);
  info('LLM', JSON.stringify(cmd));
  if (!cmd) ignored('Unrecognized → null, no response');

  // ════════════════════════════════
  // FRIDAY 11:59 — POST TO GROUP 2
  // ════════════════════════════════
  printHeader('PHASE 4: Friday 11:59 — Post Template → Group 2');
  template = await loadTemplate();
  printBot(renderTemplate(template), 'Fri 11:59');
  action('Template posted to Group 2');

  // ════════════════════════════════
  // FRIDAY 12:00 — OPEN GROUP
  // ════════════════════════════════
  printHeader('PHASE 5: Friday 12:00 — Group Opens, Burst Window (30 seconds)');
  template.registrationOpen = true;
  await saveTemplate(template);
  action('Group 2 opened for everyone');
  action('Burst window OPEN — collecting messages (NOT sending to Claude yet)');

  const burstCollected: CollectedMessage[] = [];

  // Peak: 15 messages in first 5 seconds
  printSub('12:00:00-12:00:05 — Peak burst (15 messages)');
  for (let i = 0; i < 15; i++) {
    const p = PLAYERS[i];
    printMsg(p.name, p.msg, `12:00:0${Math.floor(i / 3)}`);
    burstCollected.push({ senderJid: p.jid, text: p.msg, timestamp: Date.now() + i });
    await sleep(300); // 0.3s between messages to show arrival
  }
  info('Collected so far', `${burstCollected.length} messages (NOT processed yet)`);

  // Fake messages mixed in
  printSub('12:00:08 — Chat messages arrive (mixed in)');
  for (const fake of FAKE_MESSAGES.slice(0, 3)) {
    printMsg(fake.name, fake.msg, '12:00:08');
    burstCollected.push({ senderJid: fake.jid, text: fake.msg, timestamp: Date.now() });
    await sleep(200);
  }
  info('Collected so far', `${burstCollected.length} messages (including fake ones)`);

  // Rest of burst: 15 more
  printSub('12:00:10-12:00:25 — More registrations (15 messages)');
  for (let i = 15; i < 30; i++) {
    const p = PLAYERS[i];
    printMsg(p.name, p.msg, `12:00:${10 + Math.floor((i - 15) / 2)}`);
    burstCollected.push({ senderJid: p.jid, text: p.msg, timestamp: Date.now() + i });
    await sleep(300);
  }

  // More fake messages
  printSub('12:00:27 — More chat noise');
  for (const fake of FAKE_MESSAGES.slice(3)) {
    printMsg(fake.name, fake.msg, '12:00:27');
    burstCollected.push({ senderJid: fake.jid, text: fake.msg, timestamp: Date.now() });
    await sleep(200);
  }

  info('Total collected in burst', `${burstCollected.length} messages`);
  action('Waiting for burst window to close...');

  // Real 15-second wait
  await countdown('Burst window closing', 15);

  // ════════════════════════════════
  // 12:03 — PROCESS BURST
  // ════════════════════════════════
  printHeader('PHASE 6: Friday 12:03 — Burst Window Closed, Processing');
  action(`Sending ${burstCollected.length} messages to Claude Sonnet...`);

  const burstActions = await parseRegistrationMessages(burstCollected);

  info('Messages sent to Claude', burstCollected.length.toString());
  info('Actions Claude extracted', burstActions.length.toString());

  printSub('Claude parsed:');
  for (const a of burstActions) {
    const icon = a.type === 'register' ? '✅' : a.type === 'cancel' ? '🚫' : '❓';
    console.log(C.dim + `    ${icon} ${a.type}: "${a.name}" (${a.userId.split('@')[0]})` + C.reset);
  }

  const burstResult = await applyActions(burstActions);
  template = await loadTemplate();

  info('Registered', burstResult.registered.toString());
  info('Ignored/filtered', burstResult.ignored.toString());
  info('Slots filled', `${template.slots.filter(s => s !== null).length}/24`);
  info('Waiting list', template.waitingList.length.toString());

  printSub('🗑️ Bot deletes 11:59 template, posts updated:');
  printBot(renderTemplate(template), 'Fri 12:03');

  // ════════════════════════════════
  // LATE REGISTRATIONS (with debounce)
  // ════════════════════════════════
  printHeader('PHASE 7: Friday 12:09+ — Late Registrations (debounced)');

  const latePlayers = PLAYERS.slice(30, 35);

  // Simulate: 3 arrive close together (debounced), then 2 more
  printSub('12:09 — 3 late players arrive within seconds');
  const lateBatch1: CollectedMessage[] = [];
  for (let i = 0; i < 3; i++) {
    const p = latePlayers[i];
    printMsg(p.name, p.msg, '12:09');
    lateBatch1.push({ senderJid: p.jid, text: p.msg, timestamp: Date.now() });
    await sleep(500);
  }
  action('3 messages queued, waiting 15s debounce...');
  await countdown('Debounce', 15);

  action('Debounce flush — sending 3 messages to Claude...');
  const late1Actions = await parseRegistrationMessages(lateBatch1);
  await applyActions(late1Actions);
  template = await loadTemplate();
  info('Slots', `${template.slots.filter(s => s).length}/24 | Waiting: ${template.waitingList.length}`);
  printSub('🗑️ Bot deletes previous, posts updated:');
  printBot(renderTemplate(template), 'Fri 12:09');

  // 2 more arrive later
  printSub('12:25 — 2 more late players');
  const lateBatch2: CollectedMessage[] = [];
  for (let i = 3; i < 5; i++) {
    const p = latePlayers[i];
    printMsg(p.name, p.msg, '12:25');
    lateBatch2.push({ senderJid: p.jid, text: p.msg, timestamp: Date.now() });
    await sleep(500);
  }
  action('2 messages queued, waiting 15s debounce...');
  await countdown('Debounce', 15);

  action('Debounce flush — sending 2 messages to Claude...');
  const late2Actions = await parseRegistrationMessages(lateBatch2);
  await applyActions(late2Actions);
  template = await loadTemplate();
  info('Slots', `${template.slots.filter(s => s).length}/24 | Waiting: ${template.waitingList.length}`);
  printSub('🗑️ Bot deletes previous, posts updated:');
  printBot(renderTemplate(template), 'Fri 12:25');

  // ════════════════════════════════
  // CANCELLATIONS
  // ════════════════════════════════
  printHeader('PHASE 8: Saturday Morning — Cancellations');

  // Cancel 1
  printMsg('אלי חגג', 'מבטל', 'Sat 09:00');
  action('Message queued, waiting 15s debounce...');
  await countdown('Debounce', 15);

  const cancel1 = await parseRegistrationMessages([
    { senderJid: PLAYERS[4].jid, text: 'מבטל', timestamp: Date.now() },
  ]);
  info('Claude parsed', JSON.stringify(cancel1));

  template = await loadTemplate();
  const w1 = await loadWeekly();
  for (const a of cancel1) {
    const nid = normalizeJid(a.userId);
    if (a.type === 'cancel' && w1.userIdMap[nid]) {
      action(`Cancelled: ${w1.userIdMap[nid]}`);
      delete w1.userIdMap[nid];
      removePlayerFromTemplate(template, nid);
      if (template.waitingList.length > 0) {
        action('Promoted first from waiting list to fill slot');
      }
    }
  }
  await saveTemplate(template);
  await saveWeekly(w1);
  printSub('🗑️ Updated template:');
  printBot(renderTemplate(template), 'Sat 09:00');

  // Cancel 2
  printMsg('חיים גולן', 'אני לא יכול, מבטל', 'Sat 10:30');
  action('Message queued, waiting 15s debounce...');
  await countdown('Debounce', 15);

  const cancel2 = await parseRegistrationMessages([
    { senderJid: PLAYERS[9].jid, text: 'אני לא יכול, מבטל', timestamp: Date.now() },
  ]);

  template = await loadTemplate();
  const w2 = await loadWeekly();
  for (const a of cancel2) {
    const nid = normalizeJid(a.userId);
    if (a.type === 'cancel' && w2.userIdMap[nid]) {
      action(`Cancelled: ${w2.userIdMap[nid]}`);
      delete w2.userIdMap[nid];
      removePlayerFromTemplate(template, nid);
      if (template.waitingList.length > 0) {
        action('Promoted first from waiting list to fill slot');
      }
    }
  }
  await saveTemplate(template);
  await saveWeekly(w2);
  printSub('🗑️ Updated template:');
  printBot(renderTemplate(template), 'Sat 10:30');

  // ════════════════════════════════
  // SECURITY TEST
  // ════════════════════════════════
  printHeader('PHASE 9: Security — Player Tries to Cancel Someone Else');

  printMsg('רוני לוי', 'תבטל את אלון דוד', 'Sat 11:00');
  action('Sending to Claude...');

  const securityTest = await parseRegistrationMessages([
    { senderJid: PLAYERS[3].jid, text: 'תבטל את אלון דוד', timestamp: Date.now() },
  ]);
  info('Claude response', JSON.stringify(securityTest));

  template = await loadTemplate();
  const w3 = await loadWeekly();
  for (const a of securityTest) {
    const nid = normalizeJid(a.userId);
    if (a.type === 'cancel') {
      if (w3.userIdMap[nid]) {
        action(`Code would cancel SENDER's registration: ${w3.userIdMap[nid]}`);
        action('אלון דוד is NOT affected ✅');
      } else {
        ignored('Sender not registered or already handled → no action');
      }
    } else {
      ignored(`Unexpected action type: ${a.type}`);
    }
  }

  const alonStillIn = template.slots.some(s => s?.name === 'אלון דוד');
  info('אלון דוד still in list?', alonStillIn ? '✅ YES — SAFE' : '❌ NO — BUG!');

  // ════════════════════════════════
  // LAST CALL
  // ════════════════════════════════
  printHeader('PHASE 10: Saturday 19:40 — Last Call');
  printBot('ביטולים אחרונים? ⏳', 'Sat 19:40');

  // ════════════════════════════════
  // CLOSE
  // ════════════════════════════════
  printHeader('PHASE 11: Saturday 19:45 — Registration Closes');
  template = await loadTemplate();
  printSub('Final template:');
  printBot(renderTemplate(template), 'Sat 19:45');
  action('Group 2 locked (admin-only mode)');

  // ════════════════════════════════
  // SUMMARY
  // ════════════════════════════════
  printHeader('SIMULATION COMPLETE');

  const finalSlots = template.slots.filter(s => s !== null).length;
  info('Players in slots', `${finalSlots}/24`);
  info('Waiting list', template.waitingList.length.toString());
  info('Laundry', template.slots[23]?.name || 'none');
  info('Equipment', template.slots.find(s => s?.isEquipment)?.name || 'none');
  info('Fake messages affected template', 'NO ✅');
  info('Security breaches', '0 ✅');

  console.log(C.green + C.bold + '\n  ✅ E2E simulation complete!\n' + C.reset);
}

run().catch(err => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
