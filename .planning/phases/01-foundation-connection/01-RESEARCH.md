# Phase 1: Foundation & Connection - Research

**Researched:** 2026-02-14
**Domain:** WhatsApp bot connection, session persistence, process management
**Confidence:** MEDIUM-HIGH

## Summary

Phase 1 establishes a WhatsApp bot using Baileys (v7.0.0-rc.9), focusing on reliable connection, persistent authentication, and graceful error handling. The primary technical challenges are: (1) implementing production-grade auth state management (Baileys' built-in `useMultiFileAuthState` is explicitly not for production), (2) handling reconnection logic correctly based on DisconnectReason codes, and (3) ensuring the process stays alive with PM2 while handling uncaught errors gracefully.

Baileys uses WhatsApp's multi-device API through WebSockets (not browser automation), requiring either QR code scanning or phone number pairing. Session credentials must be persisted to survive restarts. The library provides extensive event-based APIs for connection state, credential updates, and group management.

**Primary recommendation:** Use Baileys with custom JSON-based auth state (write-file-atomic for safety), implement reconnection logic that checks DisconnectReason.loggedOut, run with PM2 in fork mode (not cluster), and add global error handlers for uncaughtException and unhandledRejection that log and exit gracefully.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @whiskeysockets/baileys | 7.0.0-rc.9 | WhatsApp Web API client | Official community-maintained Baileys library; socket-based, TypeScript-native, extensive group support |
| typescript | 5.x | Type-safe development | Industry standard for Node.js bots; Baileys is TypeScript-first |
| tsx | 4.x | TypeScript execution | Fast TS loader for development; simpler than ts-node for 2026 |
| pm2 | 5.x | Process manager | Production process management with auto-restart, logging, startup scripts |
| pino | 9.x | Logging | Fast structured logger; Baileys uses it internally |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| write-file-atomic | 5.x | Atomic JSON writes | Prevent corrupted session files on crash/kill |
| qrcode-terminal | 0.12.x | QR code display | Development/initial auth (display QR in terminal) |
| @types/node | Latest | Node.js type definitions | TypeScript development |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Baileys | whatsapp-web.js (Puppeteer-based) | Baileys is lighter (no browser), but whatsapp-web.js may have more stability for some users; user already chose Baileys |
| PM2 | systemd, Docker restart policies | PM2 offers better logging, zero-downtime reload, and cross-platform support |
| JSON files | Database (PostgreSQL/MongoDB) | JSON sufficient for v1 (no database requirement); migrate to DB in later phases if needed |
| tsx | ts-node, compiled JS | tsx is faster and simpler for modern Node; compiled JS loses dev speed |

**Installation:**
```bash
npm install @whiskeysockets/baileys pino write-file-atomic
npm install --save-dev typescript tsx @types/node qrcode-terminal
npm install -g pm2
```

## Architecture Patterns

### Recommended Project Structure
```
soccer-automation/
├── src/
│   ├── index.ts              # Entry point, socket initialization
│   ├── config/
│   │   └── env.ts            # Environment variable validation
│   ├── auth/
│   │   └── authState.ts      # Custom auth state (replace useMultiFileAuthState)
│   ├── handlers/
│   │   ├── connection.ts     # connection.update event handler
│   │   └── credentials.ts    # creds.update event handler
│   └── utils/
│       ├── logger.ts         # Pino logger setup
│       └── errors.ts         # Global error handlers
├── data/
│   └── auth/                 # Session storage (gitignored)
│       ├── creds.json
│       └── keys.json
├── logs/                     # PM2 logs
├── ecosystem.config.js       # PM2 configuration
├── tsconfig.json
└── package.json
```

### Pattern 1: Custom Auth State for JSON Storage
**What:** Replace `useMultiFileAuthState` with custom implementation using `write-file-atomic`
**When to use:** Always in production (Baileys docs explicitly warn against using built-in version)
**Why:** Baileys' `useMultiFileAuthState` "consumes a lot of IO" and is only a reference implementation
**Example:**
```typescript
// Source: Baileys docs + write-file-atomic pattern
import { writeFile } from 'write-file-atomic';
import { readFile } from 'fs/promises';
import { AuthenticationState } from '@whiskeysockets/baileys';

export async function useJsonAuthState(dataDir: string) {
  const credsPath = `${dataDir}/creds.json`;
  const keysPath = `${dataDir}/keys.json`;

  // Load existing state
  let creds, keys;
  try {
    creds = JSON.parse(await readFile(credsPath, 'utf-8'));
    keys = JSON.parse(await readFile(keysPath, 'utf-8'));
  } catch {
    // Initialize new state
    creds = {};
    keys = {};
  }

  const saveCreds = async () => {
    await writeFile(credsPath, JSON.stringify(creds, null, 2));
  };

  const saveKeys = async () => {
    await writeFile(keysPath, JSON.stringify(keys, null, 2));
  };

  return {
    state: { creds, keys },
    saveCreds,
    saveKeys
  };
}
```

### Pattern 2: Reconnection Logic with DisconnectReason
**What:** Check `lastDisconnect` status code to decide whether to reconnect
**When to use:** In `connection.update` event handler when `connection === 'close'`
**Example:**
```typescript
// Source: Baileys official example (example.ts)
import { makeWASocket, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

sock.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect } = update;

  if (connection === 'close') {
    const shouldReconnect =
      (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

    if (shouldReconnect) {
      console.log('Reconnecting...');
      startSocket(); // Recreate socket
    } else {
      console.log('Logged out, not reconnecting');
    }
  } else if (connection === 'open') {
    console.log('Connected to WhatsApp');
  }
});
```

### Pattern 3: Global Error Handlers
**What:** Catch uncaught exceptions and unhandled promise rejections to prevent silent crashes
**When to use:** Set up once at application startup (before socket initialization)
**Example:**
```typescript
// Source: Node.js docs + production best practices
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1); // Exit and let PM2 restart
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
```

### Pattern 4: PM2 Ecosystem Configuration
**What:** Configure PM2 to run TypeScript with tsx in fork mode
**When to use:** Production deployment
**Example:**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'soccer-bot',
    script: './src/index.ts',
    interpreter: 'tsx',
    instances: 1,  // MUST be 1 for tsx (fork mode)
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

### Anti-Patterns to Avoid
- **Using `useMultiFileAuthState` in production:** Excessive I/O; only use as reference implementation
- **Not checking DisconnectReason:** Reconnecting on `loggedOut` creates infinite QR generation loop
- **Running Baileys in PM2 cluster mode with tsx:** tsx forces fork mode; cluster requires compiled JS
- **Ignoring `creds.update` events:** Credentials update with every message due to Signal protocol; must save immediately
- **Synchronous file writes for auth state:** Risk corruption on process kill; use `write-file-atomic`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WhatsApp protocol implementation | Custom WebSocket client | Baileys | WhatsApp protocol is complex, frequently updated, requires Signal protocol encryption |
| Atomic file writes | Custom write-then-rename logic | write-file-atomic (1598 npm dependents) | Edge cases: permissions, full disk, cross-filesystem renames, cleanup on failure |
| Process management | Custom restart scripts, systemd timers | PM2 | Production-tested auto-restart, log rotation, startup scripts, cross-platform |
| Structured logging | console.log wrappers | Pino (Baileys uses it) | Performance (10x faster than Winston), structured JSON, log levels, serializers |
| Session encryption | Custom crypto | Baileys' built-in auth state interface | Signal protocol key management is cryptographically complex |

**Key insight:** WhatsApp bot infrastructure has well-established solutions. The complexity is in WhatsApp's protocol (Signal encryption, multi-device pairing, message acknowledgment) and process stability (reconnection, session management, crash recovery), not in the business logic. Use battle-tested libraries.

## Common Pitfalls

### Pitfall 1: Session Logout Due to Unsaved Credentials
**What goes wrong:** Bot logs out unexpectedly after restart or message activity, requiring QR re-scan
**Why it happens:** Auth keys update with every message (Signal protocol session management). If `creds.update` event isn't handled to save keys immediately, session becomes invalid
**How to avoid:** Always register `sock.ev.on('creds.update', saveCreds)` and ensure saveCreds writes atomically
**Warning signs:** DisconnectReason.badSession (500) errors, frequent logouts

### Pitfall 2: Infinite Reconnection Loop on Logout
**What goes wrong:** Bot keeps generating new QR codes infinitely, never staying connected
**Why it happens:** Reconnection logic doesn't check `DisconnectReason.loggedOut` (401), so it reconnects even when user explicitly logged out or session is invalid
**How to avoid:** Check `lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut` before reconnecting
**Warning signs:** QR codes keep appearing, logs show repeated connection attempts with 401 status

### Pitfall 3: Corrupted Session Files After kill -9
**What goes wrong:** After force-killing the process, session files are empty or malformed JSON, requiring re-authentication
**Why it happens:** Standard `fs.writeFile` doesn't guarantee atomic writes; partial writes happen if process dies mid-write
**How to avoid:** Use `write-file-atomic` which writes to temp file then renames (atomic operation)
**Warning signs:** JSON parse errors on startup, `creds.json` with incomplete data

### Pitfall 4: Process Crashes on Unhandled Errors
**What goes wrong:** Bot crashes silently on network errors, API changes, or unexpected payloads, requiring manual restart
**Why it happens:** No global error handlers; Node.js default behavior exits on uncaught exceptions
**How to avoid:** Add `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers that log and exit (PM2 will restart)
**Warning signs:** Bot stops responding with no logs; PM2 shows unexpected restarts

### Pitfall 5: Using PM2 Cluster Mode with tsx/ts-node
**What goes wrong:** PM2 fails to start or runs in fork mode despite cluster configuration
**Why it happens:** Custom interpreters (tsx, ts-node) force fork mode; cluster mode requires native Node.js to use cluster API
**How to avoid:** Either use fork mode with tsx (instances: 1) or compile to JS and use cluster mode
**Warning signs:** PM2 dashboard shows only 1 instance despite cluster config

### Pitfall 6: Not Handling restartRequired DisconnectReason
**What goes wrong:** After QR code scan, connection stays in "connecting" state or fails repeatedly
**Why it happens:** When QR is scanned, WhatsApp sends `DisconnectReason.restartRequired` (515); old socket is unusable and must be recreated
**How to avoid:** On `restartRequired`, create entirely new socket instance (don't just reconnect)
**Warning signs:** Connection hangs after successful QR scan, logs show 515 status code

## Code Examples

Verified patterns from official sources:

### Socket Initialization
```typescript
// Source: Baileys official example (github.com/WhiskeySockets/Baileys/blob/master/Example/example.ts)
import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ level: 'info' });

async function startSocket() {
  const { state, saveCreds } = await useJsonAuthState('./data/auth');

  const sock = makeWASocket({
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    generateHighQualityLinkPreview: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('QR Code:', qr); // Display with qrcode-terminal
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        startSocket();
      }
    } else if (connection === 'open') {
      console.log('Connected!');
    }
  });

  return sock;
}
```

### QR Code Display in Terminal
```typescript
// Source: qrcode-terminal package usage
import qrcode from 'qrcode-terminal';

sock.ev.on('connection.update', ({ qr }) => {
  if (qr) {
    qrcode.generate(qr, { small: true });
    console.log('Scan the QR code above with WhatsApp');
  }
});
```

### Group Event Monitoring
```typescript
// Source: Baileys docs (baileys.wiki/docs/socket/receiving-updates)
sock.ev.on('groups.update', async (updates) => {
  for (const update of updates) {
    console.log('Group updated:', update.id);
    // Refresh group metadata if needed
    const metadata = await sock.groupMetadata(update.id);
    console.log('Group name:', metadata.subject);
  }
});

sock.ev.on('group-participants.update', (update) => {
  console.log('Participants updated:', update);
  // update.action: 'add' | 'remove' | 'promote' | 'demote'
  // update.participants: string[] (JIDs)
});
```

### PM2 Start Commands
```bash
# Development (uses tsx)
pm2 start ecosystem.config.js

# Production (recommended: compile first)
npm run build  # tsc to compile
pm2 start ecosystem.config.js --env production

# Save PM2 configuration for auto-start on boot
pm2 save
pm2 startup
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @adiwajshing/baileys (original) | @whiskeysockets/baileys | 2023 | Original repo deleted; WhiskeySockets is community-maintained official version |
| ts-node for TS execution | tsx | 2023-2024 | tsx is 10x faster, simpler setup, actively maintained |
| Manual reconnection with delays | Event-based reconnection checking DisconnectReason | Baileys v5+ | More reliable; library removed auto-reconnect in favor of user-controlled logic |
| useMultiFileAuthState for production | Custom auth state implementations | Ongoing | Official docs warn against production use due to I/O issues |

**Deprecated/outdated:**
- **@adiwajshing/baileys**: Original package; use @whiskeysockets/baileys
- **baileys without @whiskeysockets/ scope**: Multiple malicious forks detected in 2025 (lotusbail with 56k downloads stole credentials)
- **Internal reconnection mechanism**: Baileys removed built-in reconnect; users implement their own
- **useMultiFileAuthState in production**: Still in code as reference, but docs explicitly say don't use

## Open Questions

1. **How to handle connection timeouts after 24 hours?**
   - What we know: GitHub issue #1625 reports connection timeout (status 428) after ~24 hours with multi-file auth state
   - What's unclear: Whether this is Baileys bug, WhatsApp server behavior, or auth state implementation issue
   - Recommendation: Implement monitoring; if 428 occurs consistently, add scheduled reconnection every 20 hours

2. **Do we need message retry counter cache?**
   - What we know: Baileys example shows `msgRetryCounterCache` option for `makeWASocket`
   - What's unclear: Whether this is required for basic operation or optimization
   - Recommendation: Omit in v1 (not mentioned in minimal examples); add if message delivery issues occur

3. **Should we implement group metadata caching?**
   - What we know: Baileys supports `cachedGroupMetadata` config option with cache lookup function
   - What's unclear: Performance impact without cache for 2 groups
   - Recommendation: Skip in v1 (only 2 groups); revisit if group operations are slow

4. **What's the best way to identify the two specific groups?**
   - What we know: Groups have JIDs (e.g., `120363...@g.us`), names (subject), and participants
   - What's unclear: Whether to identify by JID (stable) or name (user-friendly)
   - Recommendation: Use JIDs in config (stable), fetch name for logging/verification

## Sources

### Primary (HIGH confidence)
- [Baileys Official Documentation - Connecting](https://baileys.wiki/docs/socket/connecting/) - Connection patterns, auth state, QR handling
- [Baileys Official Documentation - Receiving Updates](https://baileys.wiki/docs/socket/receiving-updates/) - Event system, message events, group events
- [Baileys API Documentation - DisconnectReason](https://baileys.wiki/docs/api/enumerations/DisconnectReason/) - All disconnect codes with numeric values
- [Baileys GitHub Example](https://github.com/WhiskeySockets/Baileys/blob/master/Example/example.ts) - Official reference implementation
- [Node.js Process Documentation](https://nodejs.org/api/process.html) - uncaughtException and unhandledRejection events
- [PM2 Quick Start](https://pm2.keymetrics.io/docs/usage/quick-start/) - Basic PM2 commands and configuration

### Secondary (MEDIUM confidence)
- [npm @whiskeysockets/baileys](https://www.npmjs.com/package/@whiskeysockets/baileys) - Current version (7.0.0-rc.9), verified November 2025
- [PM2 Transpilers Documentation](https://pm2.io/docs/runtime/integration/transpilers/) - TypeScript with PM2, production warnings
- [write-file-atomic package](https://www.npmjs.com/package/write-file-atomic) - 1598 dependent packages, atomic write patterns
- [TheLinuxCode: Node.js JSON Files Guide (2026)](https://thelinuxcode.com/how-i-work-with-nodejs-and-json-files-in-real-projects-read-write-validate-and-avoid-the-traps/) - JSON storage best practices
- [OneUptime: PM2 Process Management (2026)](https://oneuptime.com/blog/post/2026-01-22-nodejs-pm2-process-management/view) - PM2 usage patterns
- [Medium: PM2 with tsx](https://blog.vramana.com/posts/2023-02-05-pm2-tsx/) - tsx interpreter configuration
- [GitHub Issue #1625](https://github.com/WhiskeySockets/Baileys/issues/1625) - Connection timeout after 24 hours

### Tertiary (LOW confidence - marked for validation)
- Multiple Medium articles on Baileys automation (2025-2026) - Implementation patterns and pitfalls, but not official sources
- Various Baileys forks and REST API wrappers - Show common patterns but may deviate from official recommendations
- GitHub issues about session management - Community-reported problems, not necessarily universal

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Versions verified from npm/official docs, Baileys is user's stated choice
- Architecture patterns: MEDIUM-HIGH - Official example code and docs available, but some patterns extrapolated from community usage
- Pitfalls: MEDIUM - Based on GitHub issues and official warnings, but not all verified in production testing
- Code examples: HIGH - Directly from Baileys official example and documentation

**Research date:** 2026-02-14
**Valid until:** ~2026-03-14 (30 days - Baileys is stable, but in RC phase; breaking changes possible)

**Key uncertainties to validate during implementation:**
- 24-hour connection timeout behavior
- Optimal auth state structure for production
- Whether QR code pairing or phone number pairing is better for this use case
