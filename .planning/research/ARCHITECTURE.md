# Architecture Research

**Domain:** WhatsApp Bot with Baileys (Scheduled Group Management)
**Researched:** 2026-02-14

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Commands │  │ Schedule │  │ Message  │  │ Admin  │  │
│  │ Handler  │  │ Manager  │  │ Parser   │  │Commands│  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │
├───────┴──────────────┴─────────────┴────────────┴───────┤
│                    Service Layer                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │       WhatsApp Client (Baileys Socket)          │    │
│  └──────────────────┬──────────────────────────────┘    │
├─────────────────────┴───────────────────────────────────┤
│                     Data Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Session  │  │  State   │  │  User    │  │Settings│  │
│  │  Store   │  │  Store   │  │  Store   │  │ Store  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
└─────────────────────────────────────────────────────────┘

External: [Claude API]  [node-cron]
```

## Recommended Project Structure

```
src/
├── core/                   # Baileys client setup
│   ├── client.ts           # WhatsApp socket initialization
│   ├── auth.ts             # Authentication state management
│   └── reconnect.ts        # Reconnection logic
├── handlers/               # Message and event handlers
│   ├── messages.ts         # Incoming message router
│   ├── adminCommands.ts    # Admin command processor (Group 1)
│   ├── registration.ts     # Registration message handler (Group 2)
│   └── events.ts           # Connection/group event handlers
├── services/               # Business logic
│   ├── registration.ts     # Registration workflow + state machine
│   ├── template.ts         # Template building and formatting
│   ├── scheduler.ts        # Cron job definitions
│   ├── parser.ts           # LLM message parsing (Claude)
│   └── groupManager.ts     # Group open/close operations
├── stores/                 # Data persistence
│   ├── database.ts         # SQLite setup (better-sqlite3)
│   ├── session.ts          # Baileys auth state
│   ├── state.ts            # Registration state (players, waitlist)
│   ├── users.ts            # User ID → name mapping
│   └── settings.ts         # Config (times, admins, roles)
├── types/                  # TypeScript definitions
│   └── index.ts            # All type definitions
├── utils/                  # Shared utilities
│   ├── logger.ts           # Pino logger setup
│   └── hebrew.ts           # Hebrew text normalization
├── config.ts               # Environment config
└── index.ts                # Application entry point
```

## Key Architectural Patterns

### 1. Event-Driven Message Routing
Baileys emits events → central dispatcher routes by group JID → specific handlers process.

### 2. State Machine for Registration Flow
States: `closed` → `preparing` → `open` → `collecting` → `active` → `last-call` → `closed`

### 3. Command Pattern for Admin Actions
Hebrew commands parsed → matched to handler functions → executed with permission checks.

### 4. LLM as Service
Isolated Claude API calls in dedicated parser service. Raw Hebrew in → structured data out.

### 5. Persistent Session Management
Baileys auth state saved on every update. Survives restarts without QR rescan.

## Data Flow

### Friday Registration Cycle
```
[Scheduler: Fri 11:59] → Post template to Group 2
[Scheduler: Fri 12:00] → Open group (change settings)
[12:00-12:03] → Collect messages in buffer
[Scheduler: 12:03] → Batch send to Claude → Fill template → Post updated list
[Every hour] → Check new messages → Update if needed
[20 min before חימום] → Post "ביטולים אחרונים?"
[15 min before חימום] → Stop processing → Close registration
```

### Admin Command Flow (Sat 11PM - Fri 11:49AM)
```
[Admin @tags bot in Group 1]
→ Check sender is admin (by JID)
→ Check message is @tagged to bot
→ Parse command (add me, remove me, set laundry, change time)
→ Update template state
→ Confirm action in Group 1
```

## Build Order

1. **Core Infrastructure** — Baileys connection, session persistence, reconnection, basic message logging
2. **State & Storage** — SQLite setup, registration state schema, user mapping, settings
3. **Admin Commands (Group 1)** — Command parsing, permission checks, template building
4. **Registration Flow (Group 2)** — Timed opening, message collection, Claude parsing, template updates
5. **Scheduling & Automation** — Cron jobs, group open/close, hourly refresh, last-call
6. **Polish & Hardening** — Error handling, rate limiting, message queuing, logging

---
*Architecture research for: WhatsApp Soccer Registration Bot*
*Researched: 2026-02-14*
