# Project Research Summary

**Project:** WhatsApp Soccer Registration Bot
**Domain:** WhatsApp Group Management / Sports Registration Automation
**Researched:** 2026-02-14
**Confidence:** HIGH

## Executive Summary

This is a WhatsApp bot for managing weekly soccer registration using a dual-group architecture (admin group + player group). The recommended approach leverages Baileys (WhatsApp Web API), Claude for natural Hebrew language parsing, and SQLite for state persistence. The system operates on a strict weekly cycle: Friday 12:00 registration opens with a 3-minute burst collection window, followed by automated list management until game time.

The core technical challenge is managing concurrent registration bursts while maintaining WhatsApp connection stability. Experts recommend a state-machine architecture with message queuing, persistent session management, and batch processing during the critical 12:00-12:03 window. The 3-minute burst collection followed by batch processing (via Claude API) solves both fairness concerns and WhatsApp rate-limiting issues.

Key risks center on session persistence failures (requiring QR re-scans), race conditions during message editing, and timezone misalignment on VPS deployments. All are mitigable through proper Baileys auth state management, database-backed state (not message parsing), and explicit timezone configuration. The architecture is deliberately simple: single-process Node.js app with SQLite, avoiding unnecessary complexity like clustering or external databases.

## Key Findings

### Recommended Stack

The stack prioritizes reliability and simplicity for single-VPS deployment. Node.js 20.x LTS with TypeScript provides the runtime foundation, while Baileys (@whiskeysockets/baileys) delivers the most actively maintained WhatsApp Web API. Claude API integration (via official SDK) enables natural Hebrew language parsing, eliminating rigid command syntax.

**Core technologies:**
- **Node.js 20.x LTS + TypeScript 5.x**: ESM support, strong typing for Baileys/Claude APIs, prevents runtime errors in async event handlers
- **@whiskeysockets/baileys**: Most actively maintained multi-device WhatsApp library, critical for persistent sessions
- **@anthropic-ai/sdk**: Official Claude integration for intelligent Hebrew message parsing
- **better-sqlite3**: Synchronous SQLite with ACID guarantees, perfect for single-process state management without external dependencies
- **node-cron**: Simple cron-based scheduling for Friday 12:00 registration cycles and hourly refreshes
- **zod**: Runtime validation for user input, config, and Claude API responses

**Critical avoidances:**
- Async SQLite libraries (node-sqlite3) — synchronous API reduces complexity
- PM2 clustering — WhatsApp connection must be singleton
- JSON file storage — corruption risk on crash, no concurrent access safety

### Expected Features

The feature set divides into table-stakes (basic registration UX), differentiators (fairness mechanisms + natural language), and anti-features (scope creep traps).

**Must have (table stakes):**
- Registration open/close controls with confirmation messages
- View current registrants with spot availability check
- Cancel registration with automatic waiting list promotion
- Duplicate registration prevention and full name enforcement
- Hebrew language support with graceful error handling
- Bot status visibility

**Should have (competitive differentiators):**
- 3-minute burst collection (12:00-12:03) for fair registration
- Claude-powered Hebrew parsing (natural language vs rigid commands)
- Automatic waiting list promotion when spots open
- Hourly refresh posts to keep players informed
- Last-call reminder before game to reduce no-shows
- Role assignment (laundry/equipment duties)
- Dual-group architecture (admin operations in Group 1, player registration in Group 2)
- Timed automatic group open/close (no manual admin action at 12:00)

**Defer to v2+ (anti-features flagged):**
- Real-time seat countdown (creates anxiety, encourages spam)
- Custom team formation (scope creep, politics)
- Payment integration (legal liability)
- Historical statistics (database bloat)
- Multi-game registration (reduces urgency)

### Architecture Approach

Event-driven message routing with state machine pattern. Baileys emits events which route through a central dispatcher to group-specific handlers (Group 1 = admin commands, Group 2 = player registration). Registration state flows through explicit states: closed → preparing → open → collecting → active → last-call → closed. Message template state is stored in SQLite and rebuilt on each update, never parsed from messages.

**Major components:**
1. **Core Layer** — Baileys socket initialization, persistent multi-file auth state, reconnection logic with message deduplication
2. **Service Layer** — Registration state machine, Claude parser service, scheduler (node-cron), template builder, group settings manager
3. **Data Layer** — SQLite stores for session (Baileys auth), state (players/waitlist), users (JID→name mapping), settings (times/admins/roles)
4. **Handler Layer** — Message router by group JID, admin command processor (Group 1), registration processor (Group 2), connection events

**Build order** follows dependency chain: Foundation (Baileys + SQLite) → Admin commands (Group 1) → Registration flow (Group 2) → Scheduling → Polish.

### Critical Pitfalls

Research identified 8 critical pitfalls with specific mitigation strategies.

1. **Session Persistence Failure** — Use `useMultiFileAuthState()` with atomic writes on every `creds.update` event. Test with kill -9, verify no QR rescan needed.
2. **Rate Limiting During Registration Burst** — Message queue (p-queue) at 40 msgs/min, batch template edits every 2-3 seconds, use reaction emoji for immediate feedback.
3. **Message Edit Race Conditions** — Store state in database, NOT parsed from messages. Single edit queue with lock, fallback to new message on edit failure.
4. **Timezone Misalignment** — Explicit `Asia/Jerusalem` timezone in node-cron, TZ environment variable, test across DST transitions.
5. **Hebrew RTL Parsing Failures** — Normalize Unicode before LLM (`normalize('NFC')`), remove direction markers, include "This is Hebrew text" in prompts, fallback keyword matching.
6. **Missing Admin Permission Checks** — Verify admin by JID (phone number), not display name. Fetch fresh group metadata per command, maintain config whitelist.
7. **Reconnection Loop Duplicates** — Message ID deduplication store, only process when connection state === 'open', use timestamps to ignore old messages during reconnect.
8. **Unhandled Promise Rejections** — Wrap ALL event handlers in try/catch, global `unhandledRejection` handler, PM2 auto-restart as last resort.

## Implications for Roadmap

Based on research, suggested 4-phase structure following dependency chain and risk mitigation strategy:

### Phase 1: Foundation & Infrastructure
**Rationale:** Session persistence, reconnection, and error handling are critical dependencies for all subsequent phases. Building this foundation first prevents rework and enables proper testing of connection stability.

**Delivers:**
- Baileys connection with persistent multi-file auth state
- SQLite database setup with schema for state/users/settings
- Reconnection logic with message deduplication
- Global error handling (unhandled rejections)
- Timezone configuration (Asia/Jerusalem)
- Basic message logging

**Addresses:**
- Session persistence pitfall (no QR re-scans)
- Reconnection duplicates
- Unhandled promise rejections
- Timezone misalignment

**Success criteria:** Kill -9 test with no QR rescan, forced disconnect with no duplicate processing

### Phase 2: Admin Commands (Group 1)
**Rationale:** Admin functionality establishes the data model for registration state before building the complex registration flow. Testing admin commands (add/remove player, set roles, change times) validates state management without registration burst complexity.

**Delivers:**
- Admin permission system (JID verification)
- Command parsing for Hebrew admin commands
- Template building logic (player list, roles, times)
- State mutations (add/remove player, assign roles)
- Group 1 message handler with @mention detection

**Addresses:**
- Admin permission checks pitfall
- Core data model for registration state
- Template formatting in Hebrew

**Uses:** SQLite state store, better-sqlite3 for ACID guarantees

**Success criteria:** Non-admin command rejected, admin adds/removes player successfully, template renders correctly

### Phase 3: Registration Flow (Group 2)
**Rationale:** With foundation and data model proven, implement the critical Friday 12:00 registration flow. This is the highest-risk phase requiring burst handling, rate limiting, and race condition prevention.

**Delivers:**
- Timed group opening (Friday 12:00) with automatic settings change
- 3-minute burst collection window (12:00-12:03)
- Message queuing with rate limiting (40 msgs/min)
- Batch template updates (every 2-3 seconds during burst)
- Cancellation with automatic waiting list promotion
- Duplicate prevention
- Reaction emoji for immediate feedback

**Addresses:**
- Rate limiting pitfall (message queue)
- Edit race conditions (database state, not message parsing)
- 3-minute burst collection (key differentiator)
- Table stakes features (registration, cancellation, duplicates)

**Implements:** Registration state machine (closed → preparing → open → collecting → active)

**Success criteria:** 50 messages in 10 seconds all queued successfully, no template corruption with concurrent edits

### Phase 4: Claude Integration & Scheduling
**Rationale:** Natural language parsing is a differentiator but not a dependency. Build after core registration flow is proven, allowing fallback to keyword matching if LLM fails.

**Delivers:**
- Claude API integration with @anthropic-ai/sdk
- Hebrew text normalization (Unicode NFC, direction marker removal)
- Natural language parsing ("אני בפנים" → registration)
- Fallback keyword matching for critical commands
- Hourly refresh scheduler
- Last-call reminder scheduler
- State machine completion (→ last-call → closed)

**Addresses:**
- Hebrew RTL parsing pitfall
- Claude as differentiator (natural language vs rigid commands)
- Hourly refresh and last-call features

**Uses:** node-cron for scheduling, zod for Claude response validation

**Success criteria:** Mixed Hebrew+emoji parsed correctly, hourly refresh runs on schedule, last-call sent 20 min before game

### Phase Ordering Rationale

- **Foundation first** prevents session stability issues that would corrupt later testing
- **Admin before registration** validates data model without burst complexity
- **Registration before LLM** proves core flow with fallback keyword matching
- **Scheduling last** adds automation to proven manual flows

Dependencies enforced: Phase 2 requires Phase 1 (database), Phase 3 requires Phase 2 (state model), Phase 4 requires Phase 3 (registration flow).

Risk mitigation: Highest-risk elements (session persistence, race conditions) addressed first in isolated phases. LLM integration deferred until core flow proven.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Registration Flow):** Complex Baileys message editing API, rate limiting behavior needs testing, group settings modification for open/close
- **Phase 4 (Claude Integration):** Hebrew prompt engineering, response validation schemas, cost optimization for burst parsing

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Well-documented Baileys session management, standard SQLite schema design
- **Phase 2 (Admin Commands):** Standard command pattern, Hebrew string matching is straightforward

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Baileys is proven for multi-device WhatsApp bots, better-sqlite3 widely used for single-process state |
| Features | HIGH | Clear table-stakes vs differentiators from domain research, anti-features well-reasoned |
| Architecture | HIGH | Event-driven Baileys pattern is established, state machine approach is standard for scheduled workflows |
| Pitfalls | HIGH | All 8 pitfalls derived from documented Baileys issues and WhatsApp API behavior |

**Overall confidence:** HIGH

### Gaps to Address

Minor areas requiring validation during implementation:

- **WhatsApp group settings API:** Exact Baileys method for opening/closing group to messages needs verification in Phase 3 planning
- **Rate limit thresholds:** Documented range is 60-100 msgs/min, actual limit may vary. Conservative 40 msgs/min recommended, monitor during testing.
- **Claude API costs:** Burst parsing (20 messages × 3× per hour) needs cost projection. Consider batching all messages in single Claude call instead of individual parsing.
- **DST transitions:** Israel DST changes in March/October. Verify node-cron handles `Asia/Jerusalem` timezone correctly across transitions.

These gaps don't block roadmap creation — flagged for phase-specific research during planning.

## Sources

### Primary (HIGH confidence)
- Baileys official documentation — session management, multi-device support, reconnection patterns
- WhatsApp rate limiting behavior — community consensus from Baileys GitHub issues
- better-sqlite3 documentation — synchronous API, ACID guarantees
- Anthropic Claude API documentation — official SDK usage, prompt engineering

### Secondary (MEDIUM confidence)
- WhatsApp bot architecture patterns — derived from multiple Baileys example repos
- Hebrew text normalization — Unicode NFC standard for RTL languages
- node-cron timezone handling — documented support for IANA timezone strings

### Tertiary (LOW confidence)
- Exact WhatsApp rate limits — undocumented, inferred from community reports (conservative approach recommended)

---
*Research completed: 2026-02-14*
*Ready for roadmap: yes*
