# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

This is a **documentation repository** for the Toonflow project. It stores architecture design, API documentation, database design, and game engine design documents. The actual source code lives in sibling repositories.

## Related Repositories

See `system/system.yml` for paths to all related repositories:

| Repository | Purpose |
|------------|---------|
| `toonflow-game-app` | Backend API service (Node.js + Express + Electron) |
| `Toonflow-game-web` | Frontend Vue3 SPA |
| `Toonflow-game-android` | Android mobile app |
| `Toonflow-vedio-web` | Video-related web frontend |
| `voice` | Voice/CosyVoice service |

**Important**: `toonflow-game-app/scripts/web/` contains frontend build artifacts, not source code. When developing the frontend, modify `Toonflow-game-web` directly.

## Backend Architecture (toonflow-game-app)

### Key Directory Structure

```
src/
├── routes/          # Route handlers (auto-discovered via glob)
├── modules/
│   └── game-runtime/    # Core game runtime engine
│       ├── engines/     # Pure logic (no DB operations)
│       │   ├── NarrativeOrchestrator    # AI dialogue coordination
│       │   ├── ChapterProgressEngine    # Chapter state machine
│       │   ├── TriggerEngine            # Conditional triggers
│       │   └── SpeakerRouteEngine       # Speaker routing
│       ├── services/     # DB operations and side effects
│       └── types/
├── agents/          # AI agent layer (prompt building, response parsing)
└── lib/
    └── gameEngine.ts     # Core data structures (~1900 lines)
```

### Design Patterns

- **Engines (纯逻辑)**: Pure functions, deterministic output, no DB access
- **Services (服务层)**: Handle DB reads/writes and external calls
- **Routes**: Auto-discovered. File naming: `routes/{module}/{action}{Resource}.ts`

### Request Pipeline

```
Request → morgan (log) → cors → express.json → JWT auth → resource isolation → handler
```

- JWT token from `Authorization` header or `?token=` query param
- All DB queries automatically scoped by `userId` for data isolation

## Game Runtime Engine

The most complex module, driving multi-character AI interactive stories.

### Core Concepts

- **StoryWorld**: Container with world settings, characters, chapter list
- **Chapter**: Contains content, tasks, triggers, entry/completion conditions
- **Session**: One complete user-AI interaction session
- **RuntimeState**: Core data structure with player/npcs/vars/flags/chapterProgress

### Event Types (EventKind)

| Type | Description | Phase |
|------|-------------|-------|
| `opening` | Opening event | introduction |
| `scene` | Scene narration | chapter_content |
| `user` | User interaction | chapter_content |
| `fixed` | Fixed ending check | chapter_ending_check |
| `ending` | Chapter ending | chapter_ending_check |

### Narrative Turn Flow

```
User input → SpeakerRouteEngine (decide speaker) → RuleOrchestrator (build plan)
  → Build AI Prompt → Call AI → Parse response → Update state → Check triggers
```

## Database

- SQLite3 with Knex.js query builder
- Database file: `db.sqlite` at project root
- Type definitions: `src/types/database.d.ts` (auto-generated)

### Key Tables

| Table | Purpose |
|-------|---------|
| `t_storyWorld / t_storyChapter` | Story world and chapters |
| `t_gameSession` | Game sessions |
| `t_sessionMessage` | Session messages |
| `t_sessionStateSnapshot` | State snapshots for save/load |
| `t_chapterTask / t_chapterTrigger` | Chapter tasks and triggers |
| `t_config` | AI model configuration |
| `t_aiTokenUsageLog` | Token usage tracking |

## Development Commands (Backend)

```bash
cd toonflow-game-app
yarn install          # Install dependencies
yarn dev              # Development mode (hot reload), port 60002
yarn dev:gui          # Electron desktop client development
yarn lint             # TypeScript type checking
yarn build            # Compile to build/
yarn dist:win         # Build Windows executable
yarn dist:mac         # Build macOS executable
```

## Frontend Development

```bash
cd Toonflow-game-web
yarn dev              # Development server (use this, not build during dev)
yarn build            # Production build (output to ../toonflow-game-app/scripts/web/)
```

**Note**: During frontend development, run `yarn dev` in the frontend repo to see changes live. Don't run `yarn build` in development — it overwrites the artifacts and slows iteration.

## Environment Configuration

| Env | Config File | Purpose | Git |
|-----|-------------|---------|-----|
| `dev` | `env/.env.dev` | Quick start, fast testing | Upload |
| `local` | `env/.env.local` | Local debugging | No upload |
| `prod` | `env/.env.prod` | Production release | Upload |

## Default Account

First login: `admin / admin123` — change password immediately after first login.

## Documentation Location

Key documents in this repository (`md/`):

- `架构设计.md` — Architecture design
- `数据库设计.md` — Database schema
- `游戏引擎设计.md` — Game runtime engine details
- `API接口文档.md` — 144+ API endpoints
- `部署指南.md` — Deployment guide
- `md/plan/` — Feature design docs and iteration records