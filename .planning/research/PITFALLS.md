# Pitfalls Research

**Domain:** WhatsApp Bot (Baileys + Group Management + Scheduled Tasks)
**Researched:** 2026-02-14

## Critical Pitfalls

### 1. Session Persistence Failure → Bot Needs QR Rescan After Restart

**What goes wrong:** Bot loses connection after VPS restart, requires QR re-scan.

**Why:** Developers often only save `creds.json` but not the full auth state, or store session in memory only.

**Prevention:**
- Use `useMultiFileAuthState()` with persistent directory
- Save auth state on EVERY `creds.update` event
- Implement atomic writes (write to temp file, then rename)
- Test: kill -9 during active messaging, verify reconnect without QR

**Phase:** 1 (Foundation)

---

### 2. Rate Limiting During Registration Burst

**What goes wrong:** 20 players register at 12:00. WhatsApp rate-limits responses. Players think bot is broken, send duplicates.

**Why:** WhatsApp enforces undocumented rate limits (~60-100 msgs/min). Burst traffic triggers limits.

**Prevention:**
- Message queue with rate limiting (p-queue, 40 msgs/min)
- Batch template edits every 2-3 seconds instead of per-registration
- Use the 3-minute collection window to batch-process
- Send reaction emoji for immediate feedback, then process in queue

**Phase:** 2 (Registration Flow)

---

### 3. Message Edit Race Conditions → Template Corruption

**What goes wrong:** Two registrations arrive simultaneously, both read same template state, one overwrites the other.

**Prevention:**
- Store registration state in database, NOT by parsing message text
- Use edit queue with lock (one edit in-flight at a time)
- Retry with backoff on edit failure
- Fall back to sending new message if edit fails

**Phase:** 2 (Registration Flow)

---

### 4. Timezone Misalignment on VPS

**What goes wrong:** Bot scheduled for Friday 12:00 Israel time. VPS is UTC. Registration opens at wrong time.

**Prevention:**
- Use node-cron with explicit timezone (`Asia/Jerusalem`)
- Set `TZ=Asia/Jerusalem` environment variable
- Test across DST transitions (March/October in Israel)
- Store all timestamps in UTC, convert for display only

**Phase:** 1 (Foundation)

---

### 5. LLM Parsing Failures with Hebrew RTL Text

**What goes wrong:** Hebrew messages include Unicode direction markers. LLM misinterprets or strips them.

**Prevention:**
- Normalize Unicode before sending to LLM (`text.normalize('NFC')`, remove `\u200E`/`\u200F`)
- Include "This is Hebrew text" instruction in prompt
- Implement fallback keyword matching for critical commands (מבטל, תרשום)
- Test with mixed content: Hebrew + emoji + numbers

**Phase:** 3 (LLM Integration)

---

### 6. Missing Admin Permission Checks

**What goes wrong:** Regular player sends admin command, bot executes it.

**Prevention:**
- Check admin status by JID (phone number), NOT display name
- Fetch fresh group metadata for each admin command
- Maintain admin whitelist in config as fallback
- Log all admin commands with JID for audit

**Phase:** 2 (Admin Commands)

---

### 7. Reconnection Loop → Duplicate Message Processing

**What goes wrong:** Connection drops during registration. Bot reconnects, processes same messages twice, registers players twice.

**Prevention:**
- Message deduplication using message ID store
- Only process messages after connection state === 'open'
- Use message timestamps to ignore old messages during reconnection
- Clear and re-attach event handlers on reconnect

**Phase:** 1 (Foundation)

---

### 8. Unhandled Promise Rejections → Bot Crash

**What goes wrong:** Malformed message → parsing throws → unhandled rejection → Node crashes → registration window missed.

**Prevention:**
- Wrap ALL event handlers in try/catch
- Add global `process.on('unhandledRejection')` handler
- Use PM2 for auto-restart as last resort
- Always return safe defaults from parser on error

**Phase:** 1 (Foundation)

## Pitfall-to-Phase Mapping

| Pitfall | Phase | Verification |
|---------|-------|-------------|
| Session Persistence | 1 | Kill -9 test, no QR rescan |
| Rate Limiting | 2 | 50 msgs/10s test, all queued |
| Edit Race Conditions | 2 | 10 concurrent edits, no corruption |
| Timezone | 1 | Schedule at 12:00 Asia/Jerusalem |
| Hebrew RTL Parsing | 3 | Test "אני בפנים", mixed text |
| Admin Checks | 2 | Non-admin command rejected |
| Reconnection Dupes | 1 | Force disconnect, no dupes |
| Unhandled Rejections | 1 | Inject errors, no crash |

---
*Pitfalls research for: WhatsApp Soccer Registration Bot*
*Researched: 2026-02-14*
