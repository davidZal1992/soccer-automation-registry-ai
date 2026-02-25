import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WASocket } from '@whiskeysockets/baileys';
import type { TemplateState, WeeklyState } from '../types.js';

// ---------------------------------------------------------------------------
// In-memory state that backs the mocked "file system"
// ---------------------------------------------------------------------------
let mockWeekly: WeeklyState;
let mockTemplate: TemplateState;

// ---------------------------------------------------------------------------
// Module mocks — must appear before any imports of the module under test
// ---------------------------------------------------------------------------
vi.mock('./state.js', () => ({
  loadWeekly: vi.fn(() => Promise.resolve(structuredClone(mockWeekly))),
  saveWeekly: vi.fn((w: WeeklyState) => {
    mockWeekly = structuredClone(w);
    return Promise.resolve();
  }),
  loadTemplate: vi.fn(() => Promise.resolve(structuredClone(mockTemplate))),
  saveTemplate: vi.fn((t: TemplateState) => {
    mockTemplate = structuredClone(t);
    return Promise.resolve();
  }),
}));

vi.mock('./claude.js', () => ({
  parseRegistrationMessages: vi.fn(),
}));

// Simulate addPlayerToTemplate filling the first null slot
vi.mock('./admin.js', () => ({
  addPlayerToTemplate: vi.fn((template: TemplateState, player: any) => {
    const idx = template.slots.findIndex(s => s === null);
    if (idx !== -1) {
      template.slots[idx] = player;
    } else {
      template.waitingList.push(player);
    }
  }),
  removePlayerFromTemplate: vi.fn(() => ({ promoted: null })),
  promoteFromWaitingList: vi.fn(() => null),
}));

vi.mock('./template.js', () => ({
  renderTemplate: vi.fn(() => 'rendered template'),
}));

vi.mock('../config/env.js', () => ({
  config: {
    groupJids: {
      managers: '111@g.us',
      players: '222@g.us',
    },
  },
}));

vi.mock('../utils/helpers.js', () => ({
  normalizeJid: vi.fn((jid: string) => jid),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports of the module under test (after vi.mock declarations)
// ---------------------------------------------------------------------------
import {
  collectRegistrationMessage,
  editCollectedMessage,
  removeCollectedMessage,
  processCollectedMessages,
} from './registration.js';
import { parseRegistrationMessages } from './claude.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeWeekly(): WeeklyState {
  return { messagesCollected: [], userIdMap: {} };
}

function makeTemplate(): TemplateState {
  return {
    weekOf: '2026-02-28',
    warmupTime: '21:00',
    startTime: '21:30',
    commitmentTime: '20:00',
    slots: Array(24).fill(null),
    waitingList: [],
    registrationOpen: true,
  };
}

const mockSock = {
  sendMessage: vi.fn(() => Promise.resolve({ key: { id: 'sent-msg-id' } })),
} as unknown as WASocket;

const USER_JID = 'user1@s.whatsapp.net';

// ---------------------------------------------------------------------------
// collectRegistrationMessage
// ---------------------------------------------------------------------------
describe('collectRegistrationMessage', () => {
  beforeEach(() => {
    mockWeekly = makeWeekly();
    mockTemplate = makeTemplate();
    vi.clearAllMocks();
  });

  it('stores a message in the buffer', async () => {
    await collectRegistrationMessage('msg1', USER_JID, 'איתי');

    expect(mockWeekly.messagesCollected).toHaveLength(1);
    expect(mockWeekly.messagesCollected[0]).toMatchObject({
      msgId: 'msg1',
      senderJid: USER_JID,
      text: 'איתי',
    });
  });

  it('records a timestamp', async () => {
    const before = Date.now();
    await collectRegistrationMessage('msg1', USER_JID, 'איתי');
    const after = Date.now();

    expect(mockWeekly.messagesCollected[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(mockWeekly.messagesCollected[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('accumulates multiple messages', async () => {
    await collectRegistrationMessage('msg1', USER_JID, 'איתי');
    await collectRegistrationMessage('msg2', 'user2@s.whatsapp.net', 'יוסי כהן');

    expect(mockWeekly.messagesCollected).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// editCollectedMessage
// ---------------------------------------------------------------------------
describe('editCollectedMessage', () => {
  beforeEach(() => {
    mockWeekly = {
      messagesCollected: [
        { msgId: 'msg1', senderJid: USER_JID, text: 'איתי', timestamp: 1000 },
      ],
      userIdMap: {},
    };
    mockTemplate = makeTemplate();
    vi.clearAllMocks();
  });

  it('updates text for the matching msgId', async () => {
    await editCollectedMessage('msg1', 'איתי גביש');
    expect(mockWeekly.messagesCollected[0].text).toBe('איתי גביש');
  });

  it('does nothing for an unknown msgId', async () => {
    await editCollectedMessage('unknown-id', 'שם אחר');
    expect(mockWeekly.messagesCollected[0].text).toBe('איתי'); // unchanged
  });

  it('preserves all other fields on the message', async () => {
    await editCollectedMessage('msg1', 'איתי גביש');
    const m = mockWeekly.messagesCollected[0];
    expect(m.msgId).toBe('msg1');
    expect(m.senderJid).toBe(USER_JID);
    expect(m.timestamp).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// removeCollectedMessage
// ---------------------------------------------------------------------------
describe('removeCollectedMessage', () => {
  beforeEach(() => {
    mockWeekly = {
      messagesCollected: [
        { msgId: 'msg1', senderJid: USER_JID, text: 'איתי גביש', timestamp: 1000 },
        { msgId: 'msg2', senderJid: 'user2@s.whatsapp.net', text: 'יוסי כהן', timestamp: 2000 },
      ],
      userIdMap: {},
    };
    vi.clearAllMocks();
  });

  it('removes the message with the given msgId', async () => {
    await removeCollectedMessage('msg1');
    expect(mockWeekly.messagesCollected).toHaveLength(1);
    expect(mockWeekly.messagesCollected[0].msgId).toBe('msg2');
  });

  it('does nothing for an unknown msgId', async () => {
    await removeCollectedMessage('unknown-id');
    expect(mockWeekly.messagesCollected).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// processCollectedMessages — the edit-then-register flow
// ---------------------------------------------------------------------------
describe('processCollectedMessages', () => {
  beforeEach(() => {
    mockWeekly = makeWeekly();
    mockTemplate = makeTemplate();
    vi.clearAllMocks();
    // Default: LLM returns no actions (overridden per-test as needed)
    vi.mocked(parseRegistrationMessages).mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // Core scenario: the bug that was reported
  // -------------------------------------------------------------------------
  it('registers player after single-word message is edited to full name', async () => {
    // Player wrote "איתי" (one word — LLM would reject it), then edited to "איתי גביש"
    await collectRegistrationMessage('msg1', USER_JID, 'איתי');
    await editCollectedMessage('msg1', 'איתי גביש');

    // LLM sees the edited text and extracts a valid registration
    vi.mocked(parseRegistrationMessages).mockResolvedValue([
      { type: 'register', name: 'איתי גביש', userId: USER_JID },
    ]);

    await processCollectedMessages(mockSock);

    // Player should be in the weekly map
    expect(mockWeekly.userIdMap[USER_JID]).toBe('איתי גביש');
    // Player should occupy a slot in the template
    const slot = mockTemplate.slots.find(s => s?.name === 'איתי גביש');
    expect(slot).toBeTruthy();
  });

  it('sends the edited text to the LLM, not the original single-word text', async () => {
    await collectRegistrationMessage('msg1', USER_JID, 'איתי');
    await editCollectedMessage('msg1', 'איתי גביש');

    await processCollectedMessages(mockSock);

    const calledMessages = vi.mocked(parseRegistrationMessages).mock.calls[0]?.[0];
    expect(calledMessages).toBeDefined();
    expect(calledMessages[0].text).toBe('איתי גביש'); // edited, not original
  });

  // -------------------------------------------------------------------------
  // Registration validation (name must have ≥ 2 words)
  // -------------------------------------------------------------------------
  it('does NOT register when LLM returns a single-word name', async () => {
    await collectRegistrationMessage('msg1', USER_JID, 'איתי');
    vi.mocked(parseRegistrationMessages).mockResolvedValue([
      { type: 'register', name: 'איתי', userId: USER_JID }, // one word
    ]);

    await processCollectedMessages(mockSock);

    expect(mockWeekly.userIdMap[USER_JID]).toBeUndefined();
    expect(mockTemplate.slots.every(s => s === null)).toBe(true);
  });

  it('registers player when LLM returns a valid two-word name', async () => {
    await collectRegistrationMessage('msg1', USER_JID, 'איתי גביש');
    vi.mocked(parseRegistrationMessages).mockResolvedValue([
      { type: 'register', name: 'איתי גביש', userId: USER_JID },
    ]);

    await processCollectedMessages(mockSock);

    expect(mockWeekly.userIdMap[USER_JID]).toBe('איתי גביש');
  });

  // -------------------------------------------------------------------------
  // Idempotency: already-registered player is not double-registered
  // -------------------------------------------------------------------------
  it('does NOT re-register a player already in userIdMap', async () => {
    mockWeekly.userIdMap[USER_JID] = 'איתי גביש'; // already registered

    await collectRegistrationMessage('msg2', USER_JID, 'בפנים שוב');
    vi.mocked(parseRegistrationMessages).mockResolvedValue([
      { type: 'register', name: 'איתי גביש', userId: USER_JID },
    ]);

    await processCollectedMessages(mockSock);

    // addPlayerToTemplate must NOT have been called
    const { addPlayerToTemplate } = await import('./admin.js');
    expect(vi.mocked(addPlayerToTemplate)).not.toHaveBeenCalled();
    // Template slots all still null (nothing was added)
    expect(mockTemplate.slots.every(s => s === null)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Buffer management
  // -------------------------------------------------------------------------
  it('clears the message buffer regardless of LLM result', async () => {
    await collectRegistrationMessage('msg1', USER_JID, 'איתי גביש');
    // LLM returns nothing — early return in processMessages
    vi.mocked(parseRegistrationMessages).mockResolvedValue([]);

    await processCollectedMessages(mockSock);

    expect(mockWeekly.messagesCollected).toHaveLength(0);
  });

  it('does nothing (no LLM call) when the buffer is empty', async () => {
    // messagesCollected is [] from makeWeekly()
    await processCollectedMessages(mockSock);

    expect(parseRegistrationMessages).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Multiple players in one batch
  // -------------------------------------------------------------------------
  it('registers multiple players from a single batch', async () => {
    const USER2_JID = 'user2@s.whatsapp.net';
    await collectRegistrationMessage('msg1', USER_JID, 'איתי גביש');
    await collectRegistrationMessage('msg2', USER2_JID, 'יוסי כהן');

    vi.mocked(parseRegistrationMessages).mockResolvedValue([
      { type: 'register', name: 'איתי גביש', userId: USER_JID },
      { type: 'register', name: 'יוסי כהן', userId: USER2_JID },
    ]);

    await processCollectedMessages(mockSock);

    expect(mockWeekly.userIdMap[USER_JID]).toBe('איתי גביש');
    expect(mockWeekly.userIdMap[USER2_JID]).toBe('יוסי כהן');
    const filled = mockTemplate.slots.filter(s => s !== null);
    expect(filled).toHaveLength(2);
  });
});
