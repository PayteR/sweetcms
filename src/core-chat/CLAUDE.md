# core-chat — CLAUDE.md

Premium support chat module. AI-powered live chat widget with escalation to support tickets.

## Module Boundary

**core-chat owns:** SupportChatWidget component, chat session/message schema, support-chat tRPC router, chat cleanup job, default config, dependency interface, tests.

**Project owns:** admin pages (`/dashboard/settings/support/chat/`), `SupportChatWidgetWrapper` (conditionally renders based on env), ticket system (support router, ticket schema), dependency wiring (`config/chat-deps.ts`).

## Import Rules

- core-chat imports from `@/core/*` (core utilities, hooks, types)
- core-chat imports only `@/server/trpc` as a framework convention (the one hard project import)
- All other project-specific behavior injected via `setChatDeps()`
- Project imports from `@/core-chat/*`
- Core (`src/core/`) never imports from core-chat

## Dependency Injection

`deps.ts` defines the `ChatDeps` interface. Project calls `setChatDeps()` once at startup (side-effect import in `server.ts`). The injected deps handle:

- **createTicketFromChat** — escalation creates a ticket (or returns null if no ticket system)
- **resolveOrgId** — resolve active organization for a user
- **sendNotification** — notify a specific user
- **sendOrgNotification** — notify all org members
- **broadcastEvent** — fire-and-forget WS broadcast to a channel
- **lookupUsers** — resolve user IDs to {id, name, email} for admin enrichment
- **callAI** — call AI with conversation history, return response text (project chooses provider)

See `src/config/chat-deps.ts` for the project-side implementation.

## Wiring Into a Project

1. **Deps:** Create `config/chat-deps.ts` calling `setChatDeps()`, import in `server.ts`
2. **Router:** Import `supportChatRouter` from `@/core-chat/routers/support-chat` in `_app.ts`
3. **Schema:** Re-export chat tables from `@/core-chat/schema/support-chat` in `schema/support.ts`
4. **Job:** Import `startSupportChatCleanupWorker` from `@/core-chat/jobs/support-chat` in `server.ts`
5. **Widget:** Use `SupportChatWidget` from `@/core-chat/components/SupportChatWidget` (or project wrapper)
6. **Config:** Import `supportChatConfig` from `@/core-chat/config`
