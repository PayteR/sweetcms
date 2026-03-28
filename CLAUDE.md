# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SweetCMS is an open-source, agent-driven headless CMS built on the T3 Stack: Next.js 16 (App Router) + tRPC + Drizzle ORM + Better Auth. PostgreSQL with UUID primary keys. Designed for AI-assisted development — this CLAUDE.md is the product differentiator.

**Tagline:** Agent-driven headless CMS for T3 Stack (Next.js + tRPC + Drizzle)

## Development

- **Package manager:** `bun`
- **Dev server:** `bun run dev` — custom server with Turbopack (port 3000)
- **First-time setup:** `bun run init` — creates DB, runs migrations, creates superadmin, seeds defaults (3 pages, 4 blog posts, 3 categories)
- **Promote user:** `bun run promote <email>` — promote user to superadmin
- **Change password:** `bun run change-password <email>` — change a user's password
- **Entry point:** `src/app/` (Next.js App Router, no locale routing yet)
- **Custom server:** `server.ts` — starts Next.js (Turbopack in dev) + BullMQ email worker (controlled by `SERVER_ROLE`)
- **Database:** `bun run db:generate` after schema changes, `bun run db:migrate` to apply, `bun run db:studio` for DB viewer
- **Type check:** `bun run typecheck`
- **Environment config:** Zod-validated env vars in `src/lib/env.ts`

## Architecture Overview

### tRPC Procedures & Usage

**Usage:** Client: `trpc.cms.list.useQuery()` / `trpc.cms.create.useMutation()` from `@/lib/trpc/client`. Server: `const api = await serverTRPC()` from `@/lib/trpc/server`. Client uses `httpBatchStreamLink`.

**Procedure types:** `publicProcedure`, `protectedProcedure`, `staffProcedure`, `sectionProcedure(section)`, `superadminProcedure`.

**Routers (`src/server/routers/_app.ts`):** `auth`, `cms`, `categories`, `media`, `options`, `revisions`, `users`.

### Database

PostgreSQL only. All CMS tables prefixed `cms_`. UUID primary keys via `gen_random_uuid()`. Drizzle ORM with schema in `src/server/db/schema/`.

**Tables:**
- `user`, `session`, `account`, `verification` — Better Auth standard
- `cms_posts` — pages and blog posts (type discriminator: `PostType.PAGE=1`, `PostType.BLOG=2`)
- `cms_post_attachments` — file attachments per post
- `cms_categories` — standalone category table
- `cms_post_categories` — many-to-many join table (post ↔ category)
- `cms_content_revisions` — JSONB snapshots for revision history
- `cms_slug_redirects` — automatic redirects when slugs change
- `cms_options` — runtime key-value config (JSONB values)
- `cms_media` — generic file storage (images, videos, documents)

### Content Type Registry

`src/config/cms.ts` — single source of truth for all CMS content types.

Content types: `page` (PostType.PAGE), `blog` (PostType.BLOG), `category` (separate table).

Lookup helpers: `getContentType(id)`, `getContentTypeByPostType(type)`, `getContentTypeByAdminSlug(slug)`.

**To add a new content type:**
1. Add config entry in `src/config/cms.ts`
2. For post-backed types: auto-registered via `cms_posts.type`. For others: create table + router
3. Add admin section page
4. Add sitemap entries in `src/app/sitemap.ts`

### File Structure

```
src/
├── app/
│   ├── assets/           — tokens.css, content.css, admin-table.css
│   ├── (auth)/           — login, register, forgot-password, reset-password
│   ├── (public)/         — public-facing content
│   │   ├── blog/         — blog list page
│   │   └── [...slug]/    — catch-all CMS route (pages, posts, categories)
│   ├── api/
│   │   ├── auth/         — Better Auth route handler
│   │   ├── trpc/         — tRPC route handler
│   │   ├── upload/       — file upload endpoint
│   │   └── uploads/      — file serving (static uploads)
│   ├── dashboard/        — admin panel
│   │   ├── assets/       — admin.css (imports admin-table.css)
│   │   ├── cms/[section]/ — CMS list/edit pages
│   │   ├── media/        — media library
│   │   ├── settings/     — site settings
│   │   └── users/        — user management
│   └── sitemap.ts        — dynamic sitemap generation
├── components/
│   ├── admin/            — PostForm, CategoryForm, CmsListView, RichTextEditor, MediaPickerDialog, AdminHeader, AdminSidebar, RevisionHistory
│   └── ui/               — ConfirmDialog, Toaster
├── config/               — cms.ts (content types), site.ts (site config)
├── lib/                  — auth, auth-client, policy, slug, translations, trpc, utils
├── scripts/              — init.ts, promote.ts, change-password.ts
├── server/
│   ├── db/schema/        — auth, cms, categories, media, post-categories
│   ├── jobs/             — email queue (BullMQ + nodemailer)
│   ├── routers/          — auth, cms, categories, media, options, revisions, users
│   ├── storage/          — pluggable storage (filesystem, future S3)
│   └── utils/            — admin-crud, cms-helpers, content-revisions
├── store/                — toast-store (Zustand)
└── types/                — cms.ts (PostType, ContentStatus, FileType)
```

### User Roles & Permissions

**Roles:** `user`, `editor`, `admin`, `superadmin` (4 roles).

**How to check permissions:**
- **Server:** `Policy.for(role).can('section.content')` or `Policy.for(role).canAccessAdmin()`
- **Superadmin-only:** `isSuperAdmin(role)` from `@/lib/policy`
- **Never** use hardcoded role strings like `role === 'admin'` — always use `Role.*` consts or `Policy.for(role).can(...)`
- **Invalid roles:** `Policy.for()` normalizes unknown/empty/null to `Role.USER` (fail-closed)

**Admin sections:** `dashboard`, `content`, `media`, `users`, `settings`

**Section capabilities by role:**
| Capability | editor | admin | superadmin |
|---|---|---|---|
| section.dashboard | yes | yes | yes |
| section.content | yes | yes | yes |
| section.media | yes | yes | yes |
| section.users | — | yes | yes |
| section.settings | — | yes | yes |
| privilege.manage_roles | — | yes | yes |

### Shared Utilities — Key Rules

Always use these instead of manual alternatives:

- **Slug uniqueness** (`src/server/utils/admin-crud.ts`): Use `ensureSlugUnique()` — never inline slug uniqueness checks
- **Status counts** (`src/server/utils/admin-crud.ts`): Use `buildStatusCounts()` for admin tab counts
- **Pagination** (`src/server/utils/admin-crud.ts`): Use `parsePagination()` + `paginatedResult()`. Standard response shape: `{ results, total, page, pageSize, totalPages }`
- **Admin lists** (`src/server/utils/admin-crud.ts`): Use `buildAdminList()` — handles conditions, sort, pagination, count in parallel
- **Soft-delete** (`src/server/utils/admin-crud.ts`): Use `softDelete()`, `softRestore()`, `permanentDelete()`
- **Revisions** (`src/server/utils/content-revisions.ts`): Use `createRevision()`, `getRevisions()`, `pickSnapshot()`
- **CMS updates** (`src/server/utils/cms-helpers.ts`): Use `updateWithRevision()` — wraps revision snapshot + slug redirect + update
- **Slugs** (`src/lib/slug.ts`): `slugify()` for URL slugs, `slugifyFilename()` for uploads. Never inline slug regex
- **Translations** (`src/lib/translations.ts`): Use `useBlankTranslations()` in admin components. All user-visible text must be wrapped in `__()` so translations can be enabled later
- **Email** (`src/server/jobs/email`): Use `enqueueEmail()` or `enqueueTemplateEmail()` — never call `sendEmail()` directly. Templates in `emails/` with `{{var}}` placeholders

### Rich Text Editor

PostForm and CategoryForm use Tiptap (`src/components/admin/RichTextEditor.tsx`). Toolbar includes: bold, italic, underline, strikethrough, code, headings (1-3), lists, blockquote, code block, horizontal rule, text alignment, links, images, undo/redo.

Content is stored as HTML in `cms_posts.content` / `cms_categories.text`.

### Media System

**Upload:** `POST /api/upload` — multipart form, requires auth + `section.media` capability. Files stored in `uploads/` with date-based paths.

**Serving:** `GET /api/uploads/[...path]` — serves files with MIME detection, cache headers, directory traversal protection.

**Media picker:** `MediaPickerDialog` component for selecting images from the media library. Used in PostForm for featured images.

**Storage provider:** `src/server/storage/index.ts` — pluggable (filesystem default, S3 TODO). Always use `getStorage().url()` for URLs.

### Admin Panel (`/dashboard`)

Section-based RBAC — each sidebar group maps to a `section.*` capability. tRPC routers use `sectionProcedure(section)`.

Dashboard shows stat cards (pages, posts, categories, users, media), content status breakdown, and quick action links.

AdminHeader displays user name + role badge. Role badges use CSS classes: `.admin-role-superadmin`, `.admin-role-admin`, `.admin-role-editor`, `.admin-role-user`.

**Admin CSS classes** (`dashboard/assets/admin.css` + `assets/admin-table.css`):
| Class | Usage |
|---|---|
| `.admin-card` | Card containers. Add padding via utility |
| `.admin-thead` | Table header row background |
| `.admin-th` | Table header cells |
| `.admin-td` | Table data cells |
| `.admin-tr` | Table rows (hover highlight) |
| `.admin-h2` | Section headings |
| `.admin-btn` | Base button class |
| `.admin-btn-primary` | Primary action button |
| `.admin-btn-secondary` | Secondary button |
| `.admin-btn-danger` | Danger/delete button |
| `.admin-btn-success` | Success/confirm button |
| `.admin-btn-sm` | Small button variant |
| `.admin-sidebar-link` | Sidebar nav links |
| `.admin-badge` | Status badges base |
| `.admin-badge-published` | Published status |
| `.admin-badge-draft` | Draft status |
| `.admin-badge-scheduled` | Scheduled status |
| `.admin-action-btn` | Row action buttons |
| `.admin-search-input` | Search fields |
| `.admin-filter-select` | Filter dropdowns |
| `.admin-input` / `.admin-label` | Form fields |
| `.admin-status-tabs` / `.admin-status-tab` | Status tab navigation |
| `.admin-pagination` | Pagination controls |
| `.admin-empty-state` | Empty state containers |
| `.admin-sortable-th` | Sortable column headers |
| `.admin-role-badge` | Role badges (superadmin/admin/editor/user) |

Always use these instead of inline Tailwind equivalents.

**Admin translations:**
```typescript
// ALWAYS use blank translations in admin:
import { useBlankTranslations } from '@/lib/translations';
const __ = useBlankTranslations();

// WRONG in admin:
<h1>Users</h1>

// RIGHT in admin:
<h1>{__('Users')}</h1>
```

### CSS Architecture

Tailwind CSS v4 with `@tailwindcss/typography` for `prose` classes. CSS-first config (no `tailwind.config.ts`).

**File structure:**
- `src/app/globals.css` — imports Tailwind, typography plugin, tokens, content CSS
- `src/app/assets/tokens.css` — design tokens (`@theme` block for Tailwind utilities + `:root` CSS vars)
- `src/app/assets/content.css` — CMS content rendering classes (`.cms-content`, `.cms-title`, `.cms-post-card`)
- `src/app/assets/admin-table.css` — comprehensive admin table/form classes
- `src/app/dashboard/assets/admin.css` — admin panel core classes (cards, buttons, sidebar)

**Layer order:** `@layer theme, base, components, utilities;` — every CSS file must declare this.

**Design tokens (`:root` vars):** `--surface-primary`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-primary`, `--shadow-sm/md/lg`, `--duration-fast/normal/slow`, `--radius-sm/md/lg/xl`.

Use `cn()` from `@/lib/utils` for conditional classes — never template literals or raw `clsx()`.

### Catch-All CMS Route (`[...slug]`)

`src/app/(public)/[...slug]/page.tsx` — handles ALL CMS content.

URL patterns:
- `/privacy-policy` → page
- `/blog/my-post` → blog post
- `/category/tech` → category (shows description + posts in category)

Supports preview mode via `?preview=<token>`.

### Post-Category Relationship

Many-to-many via `cms_post_categories` join table. CMS router `create`/`update` accept `categoryIds` array. `get` returns `categoryIds`. `listPublished` accepts optional `categoryId` to filter posts by category. PostForm includes category checkbox selector in sidebar.

### Auth Pages

- `/login` — email/password sign in with "Forgot password?" link
- `/register` — sign up with name, email, password
- `/forgot-password` — request password reset (server action → `auth.api.requestPasswordReset`)
- `/reset-password?token=...` — set new password via `authClient.resetPassword`

### Email System

BullMQ queue with nodemailer transport. Templates in `emails/` directory with HTML comment subjects.

- `enqueueEmail({ to, subject, html })` — raw email
- `enqueueTemplateEmail(to, 'welcome', { appUrl })` — templated email
- Password reset emails sent via Better Auth `sendResetPassword` callback
- Templates: `welcome.html`, `password-reset.html`
- Worker starts in `server.ts` when `SERVER_ROLE` includes workers

### Auth Middleware

`src/middleware.ts` — protects `/dashboard/*` routes. Checks `better-auth.session_token` cookie, validates via `/api/auth/get-session`, redirects banned users to `/?banned=1`, unauthenticated to `/login`.

### SERVER_ROLE (Production Scaling)

| Role | Next.js | tRPC | BullMQ | Use case |
|---|---|---|---|---|
| `all` (default) | yes | yes | yes | Development, single-instance |
| `frontend` | yes | — | — | Pages only |
| `api` | yes | yes | — | tRPC API only |
| `worker` | — | — | yes | Background jobs only |

## Coding Standards

- No `any` — use `unknown` and narrow, or generics/interfaces
- Use `cn()` from `@/lib/utils` for conditional classes — never template literals or raw `clsx()`
- No plain `Error` in server code — always `TRPCError` with proper code
- Constrain Zod inputs — `.max()` on strings, `.uuid()` on IDs, `.max(N)` on arrays
- Safety `limit` on all `.findMany()` / `.select()` queries
- `getAffectedRows()` from `@/server/db/drizzle-utils` for raw `.execute()` results
- `isNull(deletedAt)` on user-facing queries for soft-deleted tables
- Verify resource ownership — `protectedProcedure` must filter by `ctx.session.user.id`
- UUIDs everywhere — never `number` for primary keys

### Design Principles

- DRY where it reduces bugs, but type-specific redundancy is OK when abstraction would obscure intent
- Open-closed principle — extend via registration/config, don't edit shared code for new types
- Config-driven over hardcoded — new content types, features, etc. should be addable without touching core logic

### Plans

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give a list of unresolved questions, if any.

## Troubleshooting

- **Port 3000 already in use:** Kill stale `bun` or `node` process
- **Type errors after schema change:** Run `bun run db:generate` then restart dev server
- **"Cannot find module" after branch switch:** Run `bun install`
- **Migration fails:** Check `DATABASE_URL` in `.env`, ensure PostgreSQL is running. The init script creates the database automatically
- **Tiptap editor not rendering:** Ensure `@tiptap/react` and `@tiptap/starter-kit` are installed. Run `bun install`
- **Prose classes not working:** Ensure `@tailwindcss/typography` is installed and imported in `globals.css`
