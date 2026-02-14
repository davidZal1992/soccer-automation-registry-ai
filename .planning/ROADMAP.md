# Roadmap: Soccer Registration Bot

## Overview

This roadmap delivers a WhatsApp bot that automates weekly soccer registration across a dual-group architecture. We start by establishing reliable WhatsApp connection and data persistence, then build admin template management in Group 1, followed by the critical Friday 12:00 registration burst flow in Group 2, and finally integrate Claude for natural Hebrew parsing and automated scheduling. Each phase builds on proven foundations, with the highest-risk elements (session stability, race conditions) isolated and addressed early.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Connection** - Establish WhatsApp connection with session persistence
- [ ] **Phase 2: Data Layer & State Management** - Build JSON storage and error handling infrastructure
- [ ] **Phase 3: Template System** - Create template generation and formatting logic
- [ ] **Phase 4: Admin Command Processing** - Process basic admin commands in Group 1
- [ ] **Phase 5: Admin Template Modification** - Enable admins to modify template via commands
- [ ] **Phase 6: Registration Flow Core** - Implement Friday 12:00 registration burst handling
- [ ] **Phase 7: Cancellation & Waiting List** - Add cancellation with automatic promotion
- [ ] **Phase 8: LLM Integration** - Integrate Claude for Hebrew message parsing
- [ ] **Phase 9: Bot Controls & Scheduling** - Add sleep/wake controls and automated scheduling

## Phase Details

### Phase 1: Foundation & Connection
**Goal**: Bot can connect to WhatsApp, persist session across restarts, and handle reconnections without requiring QR re-scan
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-05, INFRA-06
**Success Criteria** (what must be TRUE):
  1. Bot connects to WhatsApp via Baileys and successfully authenticates via QR code
  2. Bot maintains connection to both Group 1 (managers) and Group 2 (players)
  3. Bot survives kill -9 restart without requiring QR re-scan (session persists)
  4. Bot handles unexpected disconnections and reconnects automatically
  5. Unhandled errors don't crash the process (global error handler active)
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Project setup and custom auth state implementation
- [ ] 01-02-PLAN.md — Socket connection with reconnection logic and verification

### Phase 2: Data Layer & State Management
**Goal**: Bot can store and retrieve state from JSON files with proper timezone handling
**Depends on**: Phase 1
**Requirements**: INFRA-03, INFRA-04, INFRA-07
**Success Criteria** (what must be TRUE):
  1. Bot stores all state in JSON files (session, players, settings, admins)
  2. Bot correctly calculates next Saturday date using Asia/Jerusalem timezone
  3. Bot ignores non-relevant messages without processing them
  4. JSON files survive process restarts without corruption
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 3: Template System
**Goal**: Bot can generate and format Hebrew registration templates with correct structure
**Depends on**: Phase 2
**Requirements**: TMPL-01, TMPL-02, TMPL-03, TMPL-04, TMPL-05, TMPL-06
**Success Criteria** (what must be TRUE):
  1. Bot generates template with 24 numbered spots in 8v8 format
  2. Template displays upcoming Saturday date (מוצאי שבת) correctly
  3. Laundry person appears at spot #24 with (כביסה) tag
  4. Equipment person is marked with (ציוד) tag
  5. Template includes waiting list section (רשימת המתנה) and rules footer
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 4: Admin Command Processing
**Goal**: Bot can detect admin @mentions in Group 1 and process basic add/remove commands
**Depends on**: Phase 3
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-09, ADMIN-10, ADMIN-11
**Success Criteria** (what must be TRUE):
  1. Bot only responds to @tagged messages from verified admins in Group 1
  2. Non-admin messages in Group 1 are completely ignored
  3. Admin can add themselves to template with "תרשום אותי"
  4. Admin can remove themselves from template with "תוריד אותי"
  5. Admin can add/remove other admins via bot commands
  6. Admin list persists across restarts
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 5: Admin Template Modification
**Goal**: Admins can modify template roles and times throughout the week before Friday posting
**Depends on**: Phase 4
**Requirements**: ADMIN-05, ADMIN-06, ADMIN-07, ADMIN-08, ADMIN-12, ADMIN-13, ADMIN-14
**Success Criteria** (what must be TRUE):
  1. Every Saturday at 23:00, bot posts clean template in Group 1 with next Saturday date
  2. Admin command window is open from Saturday 23:00 until Friday 11:49
  3. Admin can assign laundry person with full name (bot enforces full name requirement)
  4. Admin can assign equipment person with full name (bot enforces full name requirement)
  5. Admin can change warmup time (חימום) and start time via commands
  6. Bot responds with "תרשום שם מלא של מי שעושה כביסה" if laundry name missing
  7. Bot responds with "תרשום שם מלא של מי שמביא ציוד" if equipment name missing
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 6: Registration Flow Core
**Goal**: Bot opens registration at Friday 12:00, collects messages in 3-minute burst, and posts filled template
**Depends on**: Phase 5
**Requirements**: REG-01, REG-02, REG-03, REG-05, REG-07, REG-08, REG-10
**Success Criteria** (what must be TRUE):
  1. Bot posts prepared template in Group 2 at Friday 11:59
  2. Bot opens Group 2 at Friday 12:00 (changes settings to allow everyone to send)
  3. Bot collects all messages from 12:00 to 12:03 without processing them individually
  4. Bot posts filled template back to Group 2 after 12:03
  5. Bot enforces full name requirement (first + last name) and rejects other formats
  6. Bot prevents duplicate registrations (each person can only register one name)
  7. Bot maintains user ID to registered name mapping for the current week
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 7: Cancellation & Waiting List
**Goal**: Players can cancel registration and waiting list automatically promotes to fill spots
**Depends on**: Phase 6
**Requirements**: CNCL-01, CNCL-02, CNCL-03, CNCL-04, CNCL-05, REG-09
**Success Criteria** (what must be TRUE):
  1. Player can cancel by writing "מבטל" or similar cancellation phrase
  2. Bot identifies cancelling player by WhatsApp user ID (not by name in message)
  3. When player cancels, first person from waiting list is promoted to fill the spot
  4. If laundry person (spot #24) cancels, promoted player inherits (כביסה) tag at spot #24
  5. When all 24 spots are filled, additional registrations go to waiting list
  6. Messages that are neither registrations nor cancellations are ignored
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 8: LLM Integration
**Goal**: Bot uses Claude to parse Hebrew messages naturally and refreshes hourly after initial burst
**Depends on**: Phase 7
**Requirements**: LLM-01, LLM-02, LLM-03, LLM-04, REG-04, REG-06
**Success Criteria** (what must be TRUE):
  1. Bot sends collected messages to Claude API and receives structured registration data
  2. Claude correctly parses casual Hebrew with typos (e.g., "אני בפנים" → registration)
  3. Bot handles Claude API failures gracefully (timeout, rate limit, error) with fallback
  4. After 12:03, bot refreshes every 1 hour checking for new registrations/cancellations
  5. Hourly refresh updates template if new activity found
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 9: Bot Controls & Scheduling
**Goal**: Admins can control bot state and automated last-call reminders work
**Depends on**: Phase 8
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04, CTRL-05, CTRL-06, CTRL-07
**Success Criteria** (what must be TRUE):
  1. Only admins can control bot in Group 2 (sleep/wake commands)
  2. Admin can stop bot with "לישון" tag — bot responds "הלכתי לישון"
  3. Admin can resume bot with "התחל" tag — bot responds "קמתי לתחייה"
  4. Sleeping bot does NOT affect next week's automatic Friday cycle
  5. 20 minutes before warmup time, bot posts "ביטולים אחרונים?" in Group 2
  6. Bot waits 5 more minutes after last-call message, then stops for the week
  7. Next cycle starts automatically the following Friday
**Plans**: TBD

Plans:
- [ ] TBD during planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Connection | 0/2 | Planned | - |
| 2. Data Layer & State Management | 0/TBD | Not started | - |
| 3. Template System | 0/TBD | Not started | - |
| 4. Admin Command Processing | 0/TBD | Not started | - |
| 5. Admin Template Modification | 0/TBD | Not started | - |
| 6. Registration Flow Core | 0/TBD | Not started | - |
| 7. Cancellation & Waiting List | 0/TBD | Not started | - |
| 8. LLM Integration | 0/TBD | Not started | - |
| 9. Bot Controls & Scheduling | 0/TBD | Not started | - |
