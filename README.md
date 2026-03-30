# SweetCMS

**Agent-driven headless CMS for T3 Stack (Next.js + tRPC + Drizzle)**

Open-source CMS built for AI-assisted development. The comprehensive `CLAUDE.md` is the product differentiator — it enables AI coding agents to understand and extend the entire codebase autonomously.

## Tech Stack

- **Next.js 16** — App Router, React 19, Turbopack
- **tRPC** — End-to-end type-safe API with `httpBatchStreamLink`
- **Drizzle ORM** — PostgreSQL with UUID primary keys
- **Better Auth** — Authentication with RBAC (4 roles)
- **BullMQ** — Background job queue (email)
- **Tailwind CSS v4** — Design tokens, CSS-first config
- **Tiptap** — Rich text editor with full toolbar
- **Zod** — Input validation
- **TypeScript** — Strict mode, no `any`

## Features

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
- REST API v1 (posts, categories, tags, menus)
- RSS feeds (blog, tag)
- GDPR data export
- Content calendar view
- Shortcode system (callout, CTA, gallery, YouTube embed)

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

Open [http://localhost:3000](http://localhost:3000) — your CMS is ready.

- **Admin panel:** [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- **Blog:** [http://localhost:3000/blog](http://localhost:3000/blog)

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

| Role | Dashboard | Content | Media | Users | Settings |
|------|-----------|---------|-------|-------|----------|
| user | — | — | — | — | — |
| editor | yes | yes | yes | — | — |
| admin | yes | yes | yes | yes | yes |
| superadmin | yes | yes | yes | yes | yes |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server (Turbopack + BullMQ) |
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
│   ├── (auth)/          Login, register, forgot/reset password
│   ├── (public)/        Public content (blog, catch-all CMS route)
│   ├── api/             Auth, tRPC, upload endpoints
│   └── dashboard/       Admin panel (CMS, media, users, settings)
├── components/
│   ├── admin/           PostForm, CategoryForm, RichTextEditor, etc.
│   └── ui/              ConfirmDialog, Toaster
├── config/              Content types registry, site config
├── lib/                 Auth, policy, slug, translations, tRPC
├── server/
│   ├── db/schema/       Drizzle schema (21 tables)
│   ├── jobs/            Email queue (BullMQ + nodemailer)
│   ├── routers/         tRPC routers (18 routers)
│   ├── storage/         Pluggable storage providers (filesystem, S3)
│   └── utils/           Admin CRUD, revisions, CMS helpers
└── types/               PostType, ContentStatus, FileType
```

## Production Deployment

### SERVER_ROLE

Scale independently with the same Docker image:

| Role | Next.js | tRPC | BullMQ | Use case |
|------|---------|------|--------|----------|
| `all` (default) | yes | yes | yes | Single instance |
| `frontend` | yes | — | — | Pages only |
| `api` | yes | yes | — | API only |
| `worker` | — | — | yes | Background jobs |

### Storage

Set `STORAGE_BACKEND=s3` with S3-compatible credentials for production file storage. Works with AWS S3, MinIO, Cloudflare R2, and DigitalOcean Spaces. See `.env.example` for all options.

## Agent-Driven Development

SweetCMS is designed for AI coding agents. The `CLAUDE.md` file contains:

- Complete architecture overview
- All tRPC router documentation
- Database schema details
- CSS class reference
- Coding standards and patterns
- Troubleshooting guide

Point your AI agent at the repo and it can understand, modify, and extend the CMS autonomously.

## License

[MIT](LICENSE)
