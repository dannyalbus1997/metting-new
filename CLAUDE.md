# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sumsy** is an AI-powered meeting assistant that integrates with Microsoft Teams. It syncs calendar meetings, joins calls via a bot to record/transcribe, analyzes transcripts with AI (OpenAI or Anthropic), and emails summaries to participants.

## Architecture

Monorepo with two services orchestrated via Docker Compose:

- **backend/** — NestJS (TypeScript), port 4000, REST API prefixed `/api`
- **frontend/** — Next.js 14 App Router (TypeScript + Tailwind CSS), port 3000
- **MongoDB** (primary datastore) and **Redis** (queues) as infrastructure

### Backend Modules (NestJS)

| Module | Purpose |
|--------|---------|
| Auth | Microsoft OAuth flow, JWT access/refresh token issuance |
| User | User CRUD, Microsoft profile storage |
| Meeting | Meeting CRUD, calendar sync, pagination, AI result storage |
| Microsoft | Graph API integration (calendar, transcripts, recordings) |
| AI | Dual-provider transcript analysis (OpenAI GPT-4o / Anthropic Claude), translation |
| Bot | Teams bot via Graph Communications API, call state management, recording fetch |
| Email | Azure Communication Services email with cron-based summary dispatch |

### Frontend Structure (Next.js App Router)

- **Pages:** `/` (landing), `/login` + `/login/callback` (OAuth), `/dashboard` (meeting list), `/meeting/[id]` (detail with tabs)
- **State:** Redux Toolkit with `authSlice` and `meetingSlice`, persisted to localStorage
- **API layer:** Axios with JWT interceptor and automatic token refresh on 401
- **UI:** Tailwind CSS with custom brand colors, Lucide icons, react-hot-toast

### Key Data Flow

1. User authenticates via Microsoft OAuth -> backend exchanges code for tokens -> JWT issued
2. `/meetings/sync` pulls calendar events from Microsoft Graph
3. Bot joins Teams meeting -> recording fetched -> streamed to OpenAI Whisper for transcription
4. Transcript sent to AI (configurable provider) -> structured analysis (summary, action items, decisions, productivity score)
5. Cron job emails summaries to participants via Azure Communication Services

## Common Commands

### Backend (`cd backend`)
```bash
npm run start:dev          # Dev server with hot reload (port 4000)
npm run build              # Production build (nest build)
npm run start:prod         # Run production build
npm run lint               # ESLint with auto-fix
npm run format             # Prettier formatting
npm run test               # Jest unit tests
npm run test:watch         # Jest in watch mode
npm run test:e2e           # End-to-end tests
```

### Frontend (`cd frontend`)
```bash
npm run dev                # Dev server (port 3000)
npm run build              # Production build
npm run lint               # Next.js ESLint
```

### Docker (from repo root)
```bash
docker-compose up -d       # Start all services (MongoDB, Redis, backend, frontend)
docker-compose down        # Stop all services
```

## TypeScript Path Aliases

- Backend: `@/*` -> `src/*`
- Frontend: `@/*` -> `./src/*`

## API Design

- Global prefix: `/api`
- Swagger docs: `/api/docs`
- All meeting/user endpoints require JWT Bearer token (via `JwtAuthGuard`)
- Auth endpoints (`/auth/*`) are mostly public except `/auth/me`

## Frontend-Backend Field Mapping

The frontend normalizes backend responses: `_id` -> `id`, `summary` -> `notes`, `decisions` -> `keyPoints`. When modifying API responses or types, update normalization in `frontend/src/services/api.ts`.

## AI Provider Configuration

Set `AI_PROVIDER` env var to `openai` or `anthropic`. The AI service builds a detailed prompt requesting structured JSON output (summary, actionItems, decisions, nextSteps, productivity scoring). Response parsing and validation happens in `backend/src/ai/ai.service.ts`.
