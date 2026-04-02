# SweetCMS

**AI Agent-driven T3 SaaS starter with integrated CMS (Next.js + tRPC + Drizzle)**

Open-source SaaS starter kit built for AI-assisted development. Clone, customize, ship. The comprehensive `CLAUDE.md` enables AI coding agents to understand and extend the entire codebase autonomously.

## Tech Stack

- **Next.js 16** — App Router, React 19, Turbopack
- **tRPC** — End-to-end type-safe API with `httpBatchStreamLink`
- **Drizzle ORM** — PostgreSQL with UUID primary keys
- **Better Auth** — Authentication with RBAC (4 roles) + organizations
- **Stripe** — Subscription billing with webhooks
- **BullMQ** — Background job queue (email)
- **WebSocket** — Real-time via `ws` + Redis pub/sub
- **Tailwind CSS v4** — Design tokens, CSS-first config
- **Tiptap** — Rich text editor with full toolbar
- **Zod** — Input validation
- **TypeScript** — Strict mode, no `any`

## Features

### CMS
- Config-driven content types (pages, blog posts, portfolio, categories, tags)
- Revision history with JSONB snapshots
- Automatic slug redirects on rename
- Media library with upload/serve pipeline
- Role-based admin panel (editor, admin, superadmin)
- Email queue with HTML templates
- Dynamic sitemap generation
- Preview mode with tokens
- SEO fields (meta description, JSON-LD, noindex)
- Custom server with `SERVER_ROLE` for production scaling
- Pluggable storage (filesystem, S3-compatible)
- Content search across all types (for internal linking)
- Menu management with hierarchical items
- Form builder with submissions
- Custom fields (polymorphic, per content type)
- Audit logging
- Webhooks for content events
- REST API v1 (posts, categories, tags, menus) with [OpenAPI 3.1 spec](/api/v1/openapi)
- RSS feeds (blog, tag)
- Health check endpoint (`/api/health`) with DB + Redis status
- Structured logging (JSON in production, human-readable in dev)
- GDPR data export
- Content calendar view
- Shortcode system (callout, CTA, gallery, YouTube embed)

### SaaS
- **Multi-tenancy** — Better Auth organizations with roles (owner, admin, member), invitations, org switching
- **Stripe billing** — Checkout sessions, customer portal, webhook sync, subscription lifecycle, plan-based feature flags
- **Real-time WebSocket** — Channel-based pub/sub, Redis broadcast for multi-instance, auto-reconnect client
- **In-app notifications** — DB-backed with real-time delivery, bell icon + dropdown, mark read/unread
- **Redis rate limiting** — Sliding window (ZADD/ZRANGEBYSCORE), fail-open, per-IP and per-user limits on tRPC + REST API
- **Customer auth** — Login, register, forgot/reset password, social login (Google, Discord)
- **Account pages** — Profile settings, security (password change, session management), billing portal
- **Pricing page** — Plan comparison cards, monthly/yearly toggle, FAQ accordion

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- [Docker](https://docker.com) (for PostgreSQL + Redis)

### 1. Clone and install

```bash
git clone https://github.com/sweetai/sweetcms.git
cd sweetcms
bun install
```

### 2. Start services

```bash
docker compose up -d
```

This starts PostgreSQL (port 5433) and Redis (port 6379).

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — the defaults work with `docker compose`. Generate a secret:

```bash
openssl rand -hex 32
```

### 4. Initialize database

```bash
bun run init
```

Creates tables, runs migrations, prompts for a superadmin account, and seeds example content (3 pages, 4 blog posts, 3 categories, 4 tags).

### 5. Start development server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) — your app is ready.

- **Admin panel:** [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- **Blog:** [http://localhost:3000/blog](http://localhost:3000/blog)
- **Pricing:** [http://localhost:3000/pricing](http://localhost:3000/pricing)
- **API docs:** [http://localhost:3000/api/v1/openapi](http://localhost:3000/api/v1/openapi)
- **Health:** [http://localhost:3000/api/health](http://localhost:3000/api/health)

## Content Types

Registered in `src/config/cms.ts`. Currently includes:

| Type | URL Pattern | Admin Path |
|------|-------------|------------|
| Page | `/{slug}` | `/dashboard/cms/pages` |
| Blog | `/blog/{slug}` | `/dashboard/cms/blog` |
| Portfolio | `/portfolio/{slug}` | `/dashboard/cms/portfolio` |
| Category | `/category/{slug}` | `/dashboard/cms/categories` |
| Tag | `/tag/{slug}` | `/dashboard/cms/tags` |

Add new types by extending the `CONTENT_TYPES` array — no core code changes needed.

## Roles & Permissions

| Role | Dashboard | Content | Media | Users | Settings | Billing | Orgs |
|------|-----------|---------|-------|-------|----------|---------|------|
| user | — | — | — | — | — | — | — |
| editor | yes | yes | yes | — | — | — | — |
| admin | yes | yes | yes | yes | yes | yes | yes |
| superadmin | yes | yes | yes | yes | yes | yes | yes |

## SaaS Configuration

All SaaS features are opt-in. The CMS works standalone without any of these:

```env
# Stripe billing (disabled without STRIPE_SECRET_KEY)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...

# WebSocket (default: true, requires custom server)
WS_ENABLED=true

# Customer registration (default: true)
NEXT_PUBLIC_REGISTRATION_ENABLED=true
```

Organizations are included by default (Better Auth plugin). If you don't need multi-tenancy, remove the org schema, router, and UI — see CLAUDE.md for the full list of files.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server (Turbopack + BullMQ + WebSocket) |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run init` | Initialize DB + seed content |
| `bun run promote <email>` | Promote user to superadmin |
| `bun run change-password <email>` | Change a user's password |
| `bun run typecheck` | TypeScript type check |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Apply migrations |
| `bun run db:studio` | Open Drizzle Studio |

## Project Structure

```
src/
├── app/
│   ├── (public)/        Public content, pricing, customer auth, account pages
│   ├── api/             Auth, tRPC, upload, Stripe webhooks
│   └── dashboard/       Admin panel (CMS, media, users, settings, billing, orgs)
├── components/
│   ├── admin/           PostForm, CategoryForm, OrgSwitcher, NotificationBell, etc.
│   ├── public/          UserMenu, PricingToggle, SocialLoginButtons, AccountSidebar, etc.
│   └── ui/              ConfirmDialog, Toaster
├── config/              Content types, taxonomies, plans, pricing, site config
├── engine/              Reusable CMS infrastructure (git subtree)
├── lib/                 Auth, policy, slug, translations, tRPC, WebSocket client
├── server/
│   ├── db/schema/       Drizzle schema (auth, CMS, billing, notifications, orgs)
│   ├── jobs/            Email queue (BullMQ + nodemailer)
│   ├── lib/             Redis, Stripe, WebSocket server, notifications
│   ├── routers/         tRPC routers (20+ routers)
│   ├── storage/         Pluggable storage providers (filesystem, S3)
│   └── utils/           Admin CRUD, revisions, CMS helpers
└── store/               Zustand stores (toast, theme, sidebar)
```

## Production Deployment

### SERVER_ROLE

Scale independently with the same Docker image:

| Role | Next.js | tRPC | BullMQ | WebSocket | Use case |
|------|---------|------|--------|-----------|----------|
| `all` (default) | yes | yes | yes | yes | Single instance |
| `frontend` | yes | — | — | — | Pages only |
| `api` | yes | yes | — | yes | API + WebSocket |
| `worker` | — | — | yes | — | Background jobs |

### Storage

Set `STORAGE_BACKEND=s3` with S3-compatible credentials for production file storage. Works with AWS S3, MinIO, Cloudflare R2, and DigitalOcean Spaces.

### WebSocket

WebSocket requires the custom server (`server.ts`). Not available in serverless deployments. Redis pub/sub enables multi-instance broadcasting.

## REST API

All endpoints require an API key via `X-API-Key` header (configurable via `API_KEY` env var). Rate limited to 100 req/min per IP.

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/posts` | List published posts (paginated, filterable by lang/type) |
| `GET /api/v1/posts/{slug}` | Get single post by slug (supports preview tokens) |
| `GET /api/v1/categories` | List published categories |
| `GET /api/v1/categories/{slug}` | Get single category |
| `GET /api/v1/tags` | List tags (filterable by taxonomyId) |
| `GET /api/v1/menus/{slug}` | Get menu with nested item tree |
| `GET /api/v1/openapi` | OpenAPI 3.1 specification |

## Monitoring

`GET /api/health` returns service status with per-check latency:

```json
{
  "status": "healthy",
  "uptime": 3600.5,
  "checks": {
    "database": { "status": "ok", "latencyMs": 2 },
    "redis": { "status": "ok", "latencyMs": 1 }
  }
}
```

Returns `200` when healthy, `503` when degraded. Error details stripped in production.

## Agent-Driven Development

SweetCMS is designed for AI coding agents. The `CLAUDE.md` file contains:

- Complete architecture overview (CMS + SaaS primitives)
- All tRPC router documentation
- Database schema details (auth, CMS, billing, notifications, organizations)
- CSS class reference
- Coding standards and patterns
- Engine/project boundary rules
- Troubleshooting guide

Point your AI agent at the repo and it can understand, modify, and extend the platform autonomously.

## License

[MIT](LICENSE)
