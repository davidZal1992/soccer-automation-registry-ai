# Feature Landscape

**Domain:** WhatsApp Group Management / Sports Registration Bot
**Researched:** 2026-02-14

## Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| Registration open/close | Managers need control over when registration starts/ends | LOW |
| View current registrants | Users want to see who's registered | LOW |
| Cancel registration | Users need to back out when plans change | MEDIUM |
| Registration confirmation | Users need proof they're registered | LOW |
| Spot availability check | Users want to know if spots available | LOW |
| Bot status visibility | Users need to know if bot is active | LOW |
| Error handling for invalid input | Graceful handling of wrong format | LOW |
| Hebrew language support | Target audience is Hebrew-speaking | MEDIUM |
| Duplicate registration prevention | Users shouldn't register twice | LOW |
| Full name enforcement | Required for organized player list | LOW |

## Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity |
|---------|-------------------|------------|
| 3-minute burst collection | Fairness in high-demand registration window | MEDIUM |
| Intelligent Hebrew parsing (Claude) | Natural language registration vs rigid commands | HIGH |
| Automatic waiting list promotion | Seamless experience when spots open up | MEDIUM |
| Hourly refresh | Keeps players engaged with current state | MEDIUM |
| Last-call before game | Reduces no-shows | LOW |
| Role assignment (laundry/equipment) | Distributes game-day responsibilities | MEDIUM |
| Dual-group architecture | Separates admin operations from player noise | MEDIUM |
| Admin permission management | Flexible admin hierarchy | MEDIUM |
| Bot sleep/wake controls | Admin can pause without killing process | LOW |
| Automatic timed group open/close | No manual admin action at 12:00 | MEDIUM |

## Anti-Features (Don't Build These)

| Feature | Why Requested | Why Problematic |
|---------|---------------|-----------------|
| Real-time seat countdown | Excitement/urgency | Creates anxiety, encourages spam checking |
| Custom team formation | Users want lineup control | Scope creep, politics/favoritism |
| Payment integration | Money collection convenience | Legal liability, refund complexity |
| Historical statistics | Users want attendance stats | Database bloat, maintenance burden |
| Multi-game registration | Register for N games at once | Reduces urgency, stale registrations |
| Player rating system | Skill-based balancing | Creates toxicity, subjective |
| Automated no-show penalties | Reduce flakiness | Requires enforcement, appeals process |

## Feature Dependencies

```
[Registration System]
    └──requires──> [User State Management]
    └──requires──> [Spot Counting Logic]

[Waiting List Promotion]
    └──requires──> [Cancellation Handling]
    └──requires──> [Registration System]

[Role Assignment]
    └──requires──> [User State Management]
    └──requires──> [Persistent Storage]

[Hebrew Parsing with Claude]
    └──requires──> [API Key Management]
    └──enhances──> [Registration System]

[Dual-Group Architecture]
    └──requires──> [Group ID Configuration]
    └──requires──> [Message Routing Logic]

[Admin Commands]
    └──requires──> [Admin Permission System]
    └──enhances──> [Registration System]

[Timed Registration Opening]
    └──requires──> [Scheduler/Cron]
    └──requires──> [Group Settings Management]
```

## Feature Prioritization

| Feature | User Value | Cost | Priority |
|---------|------------|------|----------|
| Registration system | HIGH | MEDIUM | P1 |
| Cancellation + waiting list | HIGH | MEDIUM | P1 |
| Admin permissions | HIGH | MEDIUM | P1 |
| Hebrew messages | HIGH | LOW | P1 |
| Duplicate prevention | HIGH | LOW | P1 |
| Timed opening (Friday 12:00) | HIGH | MEDIUM | P1 |
| Claude Hebrew parsing | MEDIUM | HIGH | P1 |
| 3-minute burst collection | MEDIUM | MEDIUM | P1 |
| Hourly refresh | MEDIUM | MEDIUM | P2 |
| Role assignment (laundry/equipment) | MEDIUM | MEDIUM | P2 |
| Last-call reminder | MEDIUM | LOW | P2 |
| Sleep/wake controls | LOW | LOW | P2 |
| Time change commands | LOW | MEDIUM | P2 |

---
*Feature research for: WhatsApp Soccer Registration Bot*
*Researched: 2026-02-14*