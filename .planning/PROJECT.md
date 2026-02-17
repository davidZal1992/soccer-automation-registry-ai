# Soccer Registration Bot

## What This Is

A WhatsApp bot that automates weekly soccer game registration for a group of players. It manages two WhatsApp groups — a managers group (Group 1) for admin commands and template preparation, and a players group (Group 2) for weekly player registration. The bot handles template generation, timed registration opening, player list management, cancellations, and waiting list promotion — all in Hebrew.

## Core Value

The bot must reliably open registration at exactly 12:00 on Friday, accurately track who registered and who cancelled, and maintain a correct player list with waiting list promotion — so the admins don't have to do it manually.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Bot connects to WhatsApp via Baileys library with persistent session
- [ ] Bot operates in two WhatsApp groups: managers (Group 1) and players (Group 2)
- [ ] Admin command window is open from Saturday 11:00 PM (after game) until 10 minutes before Friday registration (11:49 AM)
- [ ] During the command window, admins can tag the bot in Group 1 to modify the template
- [ ] When an admin tags the bot with "תרשום אותי" (or similar), the bot adds them to the template
- [ ] When an admin tags the bot with "תוריד אותי" (or similar), the bot removes them from the template
- [ ] Template follows fixed format: 8v8, 24 spots, warmup/start times, equipment person, laundry person (spot 24)
- [ ] Admins can assign equipment person (ציוד) via bot command — must provide fu
- ll name, bot responds "תרשום שם מלא של מי שמביא ציוד" if missing
- [ ] Admins can assign laundry person (כביסה) via bot command — must provide full name, bot responds "תרשום שם מלא של מי שעושה כביסה" if missing
- [ ] Laundry person is always locked to spot #24 with (כביסה) tag
- [ ] If laundry person cancels, someone from the waiting list replaces them at spot 24 and inherits the (כביסה) tag
- [ ] Admins can change warmup time (חימום) and start time via bot commands in Group 1
- [ ] Admins can add/remove other admins via bot commands in Group 1
- [ ] All admin role assignments (laundry, equipment) require full names — bot enforces this
- [ ] On Friday at 11:59 the bot posts the template in Group 2
- [ ] On Friday at 12:00 the bot opens Group 2 (changes from admin-only to everyone can send)
- [ ] From 12:00-12:03 the bot collects all registration messages
- [ ] At 12:03 the bot sends all collected messages to Claude LLM to parse names and fill the template
- [ ] Bot posts the filled template back to Group 2
- [ ] After 12:03 the bot refreshes every 1 hour, checking for new registrations and cancellations
- [ ] Registration requires full name (first + last name) — other formats are rejected/ignored
- [ ] Each person can only register one name
- [ ] Players can cancel by writing "מבטל" or similar cancellation phrases
- [ ] On cancellation, the first person from the waiting list (רשימת המתנה) is promoted to fill the spot
- [ ] Bot identifies cancelling players by their WhatsApp user ID (mapped to registered name), not by name in the message
- [ ] Bot maintains a user ID → registered name mapping for the current week
- [ ] Messages that are not registrations or cancellations are ignored
- [ ] Bot only processes messages from admins in Group 1 — all other messages in Group 1 are ignored
- [ ] Bot only responds to @tagged messages in Group 1
- [ ] In Group 2, only admins can control the bot (turn on/off)
- [ ] Admin can stop the bot in Group 2 by tagging it with "לישון" — bot responds "הלכתי לישון"
- [ ] Admin can resume the bot in Group 2 by tagging it with "התחל" — bot responds "קמתי לתחייה"
- [ ] Sleeping the bot does NOT affect next week's automatic Friday cycle
- [ ] 20 minutes before warmup (חימום), bot asks "ביטולים אחרונים?" in Group 2
- [ ] Bot waits 5 more minutes after the last-call message, then stops for the week
- [ ] Next cycle starts automatically the following Friday
- [ ] Bot uses Claude API (Haiku/Sonnet) for parsing Hebrew WhatsApp messages into structured registration/cancellation actions
- [ ] Bot ignores all non-tagged messages in Group 1 to avoid wasting tokens
- [ ] Admins in Group 1 are tracked persistently with their name mappings

### Out of Scope

- Attendance history / stats tracking — not needed, fresh start each week
- Changing game format (always 8v8, 24 spots) — fixed format
- Official WhatsApp Business API — using Baileys (unofficial) instead
- Mobile app — bot operates entirely within WhatsApp
- Payment handling — not part of registration
- Multiple game days per week — Saturday only

## Context

- The group has ~6 rotating admins who take turns managing registration each week
- Registration is competitive — many players rush to sign up at 12:00 sharp, so the 3-minute collection window is intentional to handle the burst
- All communication is in Hebrew (casual WhatsApp Hebrew with potential typos)
- The bot user is a WhatsApp Business account created with a dedicated SIM number
- The bot needs to be admin in both groups to manage settings and post messages
- Baileys library connects via WhatsApp Web multi-device protocol
- Template date is always the upcoming Saturday (מוצאי שבת)
- Equipment and laundry roles rotate weekly — admins assign them via bot commands before Friday

## Constraints

- **WhatsApp Library**: Baileys — unofficial but well-maintained, supports multi-device
- **LLM**: Claude API (Anthropic) — strong Hebrew support, cost-effective for short message parsing
- **Language**: Node.js/TypeScript — Baileys is a Node.js library
- **Hosting**: Needs cheap hosting solution (small VPS)
- **Format**: Fixed 8v8, 24 player spots + waiting list
- **Schedule**: Weekly cycle — admin commands from Sat 11PM to Fri 11:49AM, Friday 11:59 post, 12:00 open, game Saturday night

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Baileys for WhatsApp | Free, supports group management, message editing, admin controls | — Pending |
| Claude for Hebrew parsing | Best Hebrew support among LLMs, handles casual/typo text well | — Pending |
| 3-minute collection window | Handles registration burst at 12:00 without per-message template updates | — Pending |
| User ID mapping for cancellations | Players don't always write their name when cancelling — ID lookup is more reliable | — Pending |
| Ignore non-tagged messages in Group 1 | Avoids wasting LLM tokens on general admin chat | — Pending |

---
*Last updated: 2026-02-14 after initialization*
