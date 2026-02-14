# Technology Stack

**Project:** WhatsApp Soccer Registration Bot
**Researched:** 2026-02-14

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | 20.x LTS | Runtime environment | LTS support, ESM compatibility |
| **TypeScript** | 5.x | Type safety | Strong typing for Baileys API, Claude SDK, prevents runtime errors |
| **@whiskeysockets/baileys** | Latest | WhatsApp Web API | Most actively maintained multi-device WhatsApp library |
| **@anthropic-ai/sdk** | Latest | Claude API integration | Official Anthropic SDK for Node.js |

### State Management & Persistence

| Technology | Purpose | Why Recommended |
|------------|---------|-----------------|
| **better-sqlite3** | Local SQLite database | Synchronous API, ACID guarantees, no external dependencies, perfect for single VPS |

**Alternatives considered:**
- JSON files — too risky (corruption on crash, no concurrent access safety)
- PostgreSQL — overkill for single-bot use case
- Redis — unnecessary overhead for single VPS

### Task Scheduling

| Technology | Purpose | Why Recommended |
|------------|---------|-----------------|
| **node-cron** | Scheduled tasks | Simple, reliable cron-based scheduling for Friday registration cycles |

### Supporting Libraries

| Library | Purpose |
|---------|---------|
| **pino** | Structured JSON logging |
| **zod** | Runtime validation for config, user input, Claude API responses |
| **dotenv** | Environment config (.env loading) |
| **qrcode-terminal** | Initial WhatsApp QR authentication |

### Development Tools

| Tool | Purpose |
|------|---------|
| **tsx** | TypeScript execution (faster than ts-node) |
| **vitest** | Testing (TypeScript native) |
| **prettier** | Code formatting |
| **eslint** | TypeScript-aware linting |

## Installation

```bash
# Core dependencies
npm install @whiskeysockets/baileys @anthropic-ai/sdk better-sqlite3 node-cron pino dotenv zod qrcode-terminal

# Dev dependencies
npm install -D typescript @types/node @types/better-sqlite3 tsx vitest prettier eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **baileys (old)** | Deprecated namespace | @whiskeysockets/baileys |
| **whatsapp-web.js** | Heavier, less control for multi-group | @whiskeysockets/baileys |
| **node-sqlite3** | Async API adds complexity | better-sqlite3 |
| **ts-node** | Slower, worse ESM support | tsx |
| **MongoDB** | Unnecessary complexity | better-sqlite3 |
| **PM2 clustering** | WhatsApp connection must be singleton | Single PM2 instance |

## Configuration

### TypeScript Config
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

### Package.json
```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest"
  }
}
```

## Deployment

- Use PM2 for process management (restart on crash, auto-start on reboot)
- **Single instance only** — WhatsApp connection is stateful, cannot cluster
- Minimal: 512MB RAM, 1 CPU core sufficient
- Disk: 1GB for code + logs + SQLite database

---
*Stack research for: WhatsApp Soccer Registration Bot*
*Researched: 2026-02-14*