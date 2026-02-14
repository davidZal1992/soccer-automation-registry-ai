# Requirements: Soccer Registration Bot

**Defined:** 2026-02-14
**Core Value:** Reliably open registration at 12:00 on Friday, accurately track registrations/cancellations, and maintain a correct player list with waiting list promotion — hands-free for admins.

## v1 Requirements

### Connection & Infrastructure

- [ ] **INFRA-01**: Bot connects to WhatsApp via Baileys with persistent session (survives restarts without QR rescan)
- [ ] **INFRA-02**: Bot operates in two WhatsApp groups: managers (Group 1) and players (Group 2)
- [ ] **INFRA-03**: Bot stores all state in JSON files (no database)
- [ ] **INFRA-04**: Bot ignores all messages not relevant to its function (no token waste)
- [ ] **INFRA-05**: Bot handles errors gracefully without crashing (global error handler)
- [ ] **INFRA-06**: Bot runs as a single Node.js/TypeScript process managed by PM2
- [ ] **INFRA-07**: All scheduled operations use Asia/Jerusalem timezone

### Admin Commands (Group 1)

- [ ] **ADMIN-01**: Bot only processes @tagged messages from admins in Group 1
- [ ] **ADMIN-02**: Non-admin messages in Group 1 are ignored completely
- [ ] **ADMIN-03**: Admin can add themselves to template ("תרשום אותי")
- [ ] **ADMIN-04**: Admin can remove themselves from template ("תוריד אותי")
- [ ] **ADMIN-05**: Admin can assign laundry person with full name — bot responds "תרשום שם מלא של מי שעושה כביסה" if name missing
- [ ] **ADMIN-06**: Admin can assign equipment person with full name — bot responds "תרשום שם מלא של מי שמביא ציוד" if name missing
- [ ] **ADMIN-07**: Admin can change warmup time (חימום)
- [ ] **ADMIN-08**: Admin can change start time
- [ ] **ADMIN-09**: Admin can add new admins to the bot
- [ ] **ADMIN-10**: Admin can remove admins from the bot
- [ ] **ADMIN-11**: Bot persistently stores admin list with name mappings
- [ ] **ADMIN-12**: Every Saturday at 23:00, bot automatically posts a clean template in Group 1 with next Saturday's date
- [ ] **ADMIN-13**: Admin command window is open from Saturday 23:00 (after template posted) until 10 minutes before Friday registration (11:49 AM)
- [ ] **ADMIN-14**: Admins modify the template throughout the week via @tagged commands before it gets posted to Group 2 on Friday

### Template System

- [ ] **TMPL-01**: Template follows fixed format: 8v8, 24 numbered spots, warmup/start times, equipment/laundry persons
- [ ] **TMPL-02**: Template date is always the upcoming Saturday (מוצאי שבת) auto-calculated
- [ ] **TMPL-03**: Laundry person is always locked to spot #24 with (כביסה) tag
- [ ] **TMPL-04**: Equipment person is marked with (ציוד) tag
- [ ] **TMPL-05**: Template includes waiting list section (רשימת המתנה)
- [ ] **TMPL-06**: Template includes rules footer (full name required, one name per person, laundry is #24)

### Registration Flow (Group 2)

- [ ] **REG-01**: Bot posts the prepared template in Group 2 at Friday 11:59
- [ ] **REG-02**: Bot opens Group 2 at Friday 12:00 (changes from admin-only to everyone can send)
- [ ] **REG-03**: Bot collects all messages from 12:00 to 12:03 (3-minute burst window)
- [ ] **REG-04**: At 12:03 bot sends all collected messages to Claude API to parse names and fill the template
- [ ] **REG-05**: Bot posts the filled template back to Group 2
- [ ] **REG-06**: After 12:03, bot refreshes every 1 hour — checks new messages, updates template if new registrations/cancellations found
- [ ] **REG-07**: Registration requires full name (first + last name in Hebrew) — other formats are ignored
- [ ] **REG-08**: Each person can only register one name (duplicate prevention)
- [ ] **REG-09**: When all 24 spots are filled, additional registrations go to waiting list (רשימת המתנה)
- [ ] **REG-10**: Bot maintains a user ID → registered name mapping for the current week

### Cancellation & Waiting List

- [ ] **CNCL-01**: Player can cancel by writing "מבטל" or similar cancellation phrase
- [ ] **CNCL-02**: Bot identifies cancelling player by WhatsApp user ID (not by name in message)
- [ ] **CNCL-03**: On cancellation, the first person from the waiting list is promoted to fill the spot
- [ ] **CNCL-04**: If the laundry person (spot #24) cancels, the promoted player inherits the (כביסה) tag at spot #24
- [ ] **CNCL-05**: Messages that are not registrations or cancellations are ignored

### Bot Controls (Group 2)

- [ ] **CTRL-01**: Only admins can control the bot in Group 2
- [ ] **CTRL-02**: Admin can stop bot by tagging it with "לישון" — bot responds "הלכתי לישון"
- [ ] **CTRL-03**: Admin can resume bot by tagging it with "התחל" — bot responds "קמתי לתחייה"
- [ ] **CTRL-04**: Sleeping the bot does NOT affect next week's automatic Friday cycle
- [ ] **CTRL-05**: 20 minutes before warmup (חימום), bot posts "ביטולים אחרונים?" in Group 2
- [ ] **CTRL-06**: Bot waits 5 more minutes after last-call message, then stops for the week
- [ ] **CTRL-07**: Next cycle starts automatically the following Friday

### LLM Integration

- [ ] **LLM-01**: Bot uses Claude API (Haiku/Sonnet) to parse Hebrew WhatsApp messages into structured registration/cancellation actions
- [ ] **LLM-02**: Claude parses batch of messages and returns structured list of names for template
- [ ] **LLM-03**: Claude handles casual Hebrew, typos, and common registration phrases
- [ ] **LLM-04**: Bot handles Claude API failures gracefully (timeout, rate limit, error)

## v2 Requirements

### Reliability

- **REL-01**: Automatic reconnection on WhatsApp disconnect with exponential backoff
- **REL-02**: Message deduplication on reconnection (no double registrations)
- **REL-03**: Message queue with rate limiting for WhatsApp API calls

### Enhanced Features

- **ENH-01**: Admin can configure game format (5v5, 7v7, etc.) with different spot counts
- **ENH-02**: Attendance history tracking across weeks
- **ENH-03**: Health check endpoint for monitoring

## Out of Scope

| Feature | Reason |
|---------|--------|
| Database (SQLite/PostgreSQL) | JSON files sufficient for current scale, migrate later if needed |
| Real-time seat countdown | Creates anxiety, hourly refresh sufficient |
| Custom team formation | Scope creep, politics/favoritism |
| Payment integration | Legal liability, refund complexity |
| Player rating system | Creates toxicity, subjective |
| Multi-game registration | Reduces urgency, stale registrations |
| Mobile app | Bot operates within WhatsApp |
| Official WhatsApp Business API | Using Baileys (unofficial) |
| Auto-reconnection (v1) | Keep simple, add in v2 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |
| INFRA-03 | Phase 2 | Pending |
| INFRA-04 | Phase 2 | Pending |
| INFRA-07 | Phase 2 | Pending |
| TMPL-01 | Phase 3 | Pending |
| TMPL-02 | Phase 3 | Pending |
| TMPL-03 | Phase 3 | Pending |
| TMPL-04 | Phase 3 | Pending |
| TMPL-05 | Phase 3 | Pending |
| TMPL-06 | Phase 3 | Pending |
| ADMIN-01 | Phase 4 | Pending |
| ADMIN-02 | Phase 4 | Pending |
| ADMIN-03 | Phase 4 | Pending |
| ADMIN-04 | Phase 4 | Pending |
| ADMIN-09 | Phase 4 | Pending |
| ADMIN-10 | Phase 4 | Pending |
| ADMIN-11 | Phase 4 | Pending |
| ADMIN-05 | Phase 5 | Pending |
| ADMIN-06 | Phase 5 | Pending |
| ADMIN-07 | Phase 5 | Pending |
| ADMIN-08 | Phase 5 | Pending |
| ADMIN-12 | Phase 5 | Pending |
| ADMIN-13 | Phase 5 | Pending |
| ADMIN-14 | Phase 5 | Pending |
| REG-01 | Phase 6 | Pending |
| REG-02 | Phase 6 | Pending |
| REG-03 | Phase 6 | Pending |
| REG-05 | Phase 6 | Pending |
| REG-07 | Phase 6 | Pending |
| REG-08 | Phase 6 | Pending |
| REG-10 | Phase 6 | Pending |
| CNCL-01 | Phase 7 | Pending |
| CNCL-02 | Phase 7 | Pending |
| CNCL-03 | Phase 7 | Pending |
| CNCL-04 | Phase 7 | Pending |
| CNCL-05 | Phase 7 | Pending |
| REG-09 | Phase 7 | Pending |
| LLM-01 | Phase 8 | Pending |
| LLM-02 | Phase 8 | Pending |
| LLM-03 | Phase 8 | Pending |
| LLM-04 | Phase 8 | Pending |
| REG-04 | Phase 8 | Pending |
| REG-06 | Phase 8 | Pending |
| CTRL-01 | Phase 9 | Pending |
| CTRL-02 | Phase 9 | Pending |
| CTRL-03 | Phase 9 | Pending |
| CTRL-04 | Phase 9 | Pending |
| CTRL-05 | Phase 9 | Pending |
| CTRL-06 | Phase 9 | Pending |
| CTRL-07 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 47 total
- Mapped to phases: 47
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-14 after roadmap creation*
