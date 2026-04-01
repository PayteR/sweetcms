# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SweetCMS is an open-source, agent-driven headless CMS built on the T3 Stack: Next.js 16 (App Router) + tRPC + Drizzle ORM + Better Auth. PostgreSQL with UUID primary keys. Designed for AI-assisted development — this CLAUDE.md is the product differentiator.

**Tagline:** Agent-driven headless CMS for T3 Stack (Next.js + tRPC + Drizzle)

## Development

- **Package manager:** `bun`
- **Dev server:** `bun run dev` — custom server with Turbopack (port 3000)
- **First-time setup:** `bun run init` — creates DB, runs migrations, creates superadmin, seeds defaults (3 pages, 4 blog posts, 3 categories, 4 tags)
- **Promote user:** `bun run promote <email>` — promote user to superadmin
- **Change password:** `bun run change-password <email>` — change a user's password
- **Entry point:** `src/app/` (Next.js App Router, no locale routing yet)
- **Custom server:** `server.ts` — starts Next.js (Turbopack in dev) + BullMQ email worker (controlled by `SERVER_ROLE`)
- **Database:** `bun run db:generate` after schema changes, `bun run db:migrate` to apply, `bun run db:studio` for DB viewer
- **Type check:** `bun run typecheck`
- **Tests:** `bun test` — Vitest with jsdom environment. Tests in `__tests__/` directories.
- **Environment config:** Zod-validated env vars in `src/lib/env.ts`

## Architecture Overview

### Engine / Project Boundary

`src/engine/` contains reusable CMS infrastructure — do not modify per-project.
`src/config/`, `src/server/`, `src/app/`, `src/components/admin/` (forms) are project-specific — customize freely.

**Engine provides:** config interfaces + factory helpers, types (PostType, ContentStatus), RBAC policy, CRUD utils (admin-crud, taxonomy-helpers, cms-helpers, content-revisions, slug-redirects), lib utils (slug, markdown, audit, webhooks), hooks (form state, list state, autosave, bulk actions), shared components (CmsFormShell, RichTextEditor, SEOFields, TagInput, MediaPickerDialog, CustomFieldsEditor, RevisionHistory, BulkActionBar, CommandPalette, SlideOver), styles (tokens, admin CSS).

**Project provides:** content type data (`src/config/cms.ts`), taxonomy data (`src/config/taxonomies.ts`), DB schema, tRPC routers, form components (PostForm, CategoryForm, etc.), routes, public UI.

**Import rule:** project imports from `@/engine/*`. Engine accepts cross-boundary imports from `@/server/db`, `@/lib/trpc/client`, `@/lib/translations`, `@/lib/utils`, `@/store/toast-store`.

**Engine stores:** `src/engine/store/preferences-store.ts` (Zustand preferences with typed keys from `@/engine/types/preferences`).

**To rebrand:** In `src/engine/styles/tokens.css`: (1) find-replace `350` with your brand hue and `303` with your accent hue in the brand/accent scales; (2) update `--brand-hue` and `--accent-hue` in `:root` to match; (3) optionally change gray hue `260`/`265` to match your brand (260 = cool blue-violet, works well as universal neutral); (4) update hardcoded `260` in dark surface tokens and in `admin.css` (rail, L2 panel backgrounds); (5) update `--gradient-brand` L/C values to match your new brand scale.

### tRPC Procedures & Usage

**Usage:** Client: `trpc.cms.list.useQuery()` / `trpc.cms.create.useMutation()` from `@/lib/trpc/client`. Server: `const api = await serverTRPC()` from `@/lib/trpc/server`. Client uses `httpBatchStreamLink`.

**Procedure types:** `publicProcedure`, `protectedProcedure`, `staffProcedure`, `sectionProcedure(section)`, `superadminProcedure`.

**Routers (`src/server/routers/_app.ts`):** `analytics`, `audit`, `auth`, `categories`, `cms`, `contentSearch`, `customFields`, `forms`, `import`, `jobQueue`, `media`, `menus`, `options`, `portfolio`, `redirects`, `revisions`, `tags`, `users`, `webhooks`.

### Database

PostgreSQL only. All CMS tables prefixed `cms_`. UUID primary keys via `gen_random_uuid()`. Drizzle ORM with schema in `src/server/db/schema/`.

**Tables:**
- `user`, `session`, `account`, `verification` — Better Auth standard
- `cms_posts` — pages and blog posts (type discriminator: `PostType.PAGE=1`, `PostType.BLOG=2`)
- `cms_post_attachments` — file attachments per post
- `cms_categories` — standalone category table (rich: SEO, content, icon, jsonLd)
- `cms_portfolio` — portfolio items (custom table: clientName, projectUrl, techStack jsonb, completedAt, featuredImage, SEO fields, revision history)
- `cms_terms` — universal taxonomy terms (simple: name, slug, lang, status, order). Used for tags; extensible for future taxonomies
- `cms_term_relationships` — polymorphic M:N (objectId, termId, taxonomyId). Links posts to categories AND tags. `taxonomyId` discriminator: `'category'` → termId points to `cms_categories.id`, `'tag'` → termId points to `cms_terms.id`. No FK on termId (app-level enforcement)
- `cms_content_revisions` — JSONB snapshots for revision history
- `cms_slug_redirects` — automatic redirects when slugs change
- `cms_options` — runtime key-value config (JSONB values)
- `cms_media` — generic file storage (images, videos, documents)
- `cms_menus` — menu definitions (name, slug)
- `cms_menu_items` — hierarchical menu items (label, url, content link, parent, order)
- `cms_webhooks` — webhook registrations (url, secret, events, active)
- `cms_audit_log` — audit trail (userId, action, entityType, entityId, metadata)
- `cms_custom_field_definitions` — custom field schemas (name, slug, fieldType, options, contentTypes)
- `cms_custom_field_values` — custom field data (polymorphic: fieldDefinitionId, contentType, contentId, value JSONB)
- `cms_forms` — form builder definitions (name, slug, fields JSONB, recipientEmail, honeypot)
- `cms_form_submissions` — form submission data (formId, data JSONB, ip, userAgent)

### Content Type Registry

`src/config/cms.ts` — single source of truth for all CMS content types.

Content types: `page` (PostType.PAGE), `blog` (PostType.BLOG), `portfolio` (separate table), `category` (separate table), `tag` (uses `cms_terms`).

Lookup helpers: `getContentType(id)`, `getContentTypeByPostType(type)`, `getContentTypeByAdminSlug(slug)`.

Exported types: `PostContentTypeId` (union of IDs with postType: `'page' | 'blog'`), `AdminSlug` (union of all adminSlugs: `'pages' | 'blog' | 'categories' | 'tags' | 'portfolio'`).

### Taxonomy System

WordPress-style universal taxonomy with config-driven declarations.

**Config:** `src/config/taxonomies.ts` — `TaxonomyDeclaration` interface + registry.

| Taxonomy | Table | Input type | Content types | Detail page |
|---|---|---|---|---|
| `category` | `cms_categories` (custom) | checkbox | blog | yes |
| `tag` | `cms_terms` (universal) | tag-input (autocomplete + create-on-enter) | blog, page, portfolio | yes |

**Helpers:** `getTaxonomy(id)`, `getTaxonomyByAdminSlug(slug)`, `getTaxonomiesForContentType(ctId)`.

**Relationship helpers** (`src/engine/crud/taxonomy-helpers.ts`):
- `syncTermRelationships(db, objectId, taxonomyId, termIds[])` — delete+insert
- `getTermRelationships(db, objectId, taxonomyId?)` — get relations for a post
- `deleteAllTermRelationships(db, objectId)` — cascade on post delete
- `deleteTermRelationshipsByTerm(db, termId, taxonomyId)` — cascade on term delete

**Tags router** (`src/server/routers/tags.ts`): Full CRUD on `cms_terms` where `taxonomyId='tag'`. Special: `getOrCreate` mutation (find by slug or create), `search` query (autocomplete).

**To add a new taxonomy:**
1. Add declaration in `src/config/taxonomies.ts`
2. If simple (name+slug only): reuse `cms_terms` table, create router scoped to new taxonomyId
3. If rich (custom fields): create dedicated table + router, set `customTable: true`
4. Add to `cms_term_relationships` with new taxonomyId discriminator
5. Add admin UI input component + wire into PostForm
6. Add content type entry in `src/config/cms.ts` if it has a public detail page
7. Update catch-all route + sitemap

**To add a new content type:**
1. Add config entry in `src/config/cms.ts`
2. For post-backed types: auto-registered via `cms_posts.type`. For others: create table + router
3. Add admin section page
4. Add sitemap entries in `src/app/sitemap.ts`

### File Structure

```
src/
├── app/
│   ├── (auth)/           — login, register, forgot-password, reset-password
│   ├── (public)/         — public-facing content
│   │   ├── blog/         — blog list page
│   │   ├── portfolio/    — portfolio list page
│   │   ├── search/       — content search page
│   │   └── [...slug]/    — catch-all CMS route (pages, posts, categories, tags, portfolio)
│   ├── api/
│   │   ├── auth/         — Better Auth route handler
│   │   ├── feed/         — RSS feeds (blog, tag)
│   │   ├── forms/        — form submission API
│   │   ├── gdpr-export/  — GDPR user data export
│   │   ├── trpc/         — tRPC route handler
│   │   ├── upload/       — file upload endpoint
│   │   ├── uploads/      — file serving (static uploads)
│   │   └── v1/           — REST API v1 (posts, categories, tags, menus)
│   ├── dashboard/        — admin panel
│   │   ├── cms/
│   │   │   ├── [section]/ — CMS list/edit pages (pages, blog, categories, tags, landing pages)
│   │   │   ├── activity/  — audit activity log
│   │   │   ├── calendar/  — content calendar view
│   │   │   ├── menus/     — menu management
│   │   │   └── redirects/ — slug redirect management
│   │   ├── forms/        — form builder & submissions
│   │   ├── media/        — media library
│   │   ├── settings/     — site settings, custom-fields, email-templates, import, job-queue, webhooks
│   │   └── users/        — user management
│   └── sitemap.ts        — dynamic sitemap generation
├── components/
│   ├── admin/            — PostForm, CategoryForm, PortfolioForm, TermForm, CmsListView, AdminSidebar, DashboardShell, StatCard, RecentActivity, GA4Widget, TranslationBar, shortcodes/
│   ├── public/           — ContactForm, DynamicNav, PostCard, ShortcodeRenderer, TagCloud, shortcodes/
│   └── ui/               — ConfirmDialog, Toaster
├── config/               — cms.ts (content types), taxonomies.ts (taxonomy declarations), site.ts (site config)
├── engine/
│   ├── config/           — ContentTypeDeclaration, TaxonomyDeclaration interfaces + factory helpers
│   ├── crud/             — admin-crud, taxonomy-helpers, cms-helpers, content-revisions, slug-redirects
│   ├── hooks/            — useCmsFormState, useCmsAutosave, useListViewState, useBulkActions, etc.
│   ├── policy/           — Role, Policy, Capability, isSuperAdmin
│   ├── components/       — CmsFormShell, RichTextEditor, SEOFields, TagInput, MediaPickerDialog, CommandPalette, SlideOver, etc.
│   ├── lib/              — slug, markdown, audit, webhooks
│   ├── types/            — PostType, ContentStatus, FileType, ContentSnapshot
│   └── styles/           — tokens.css (OKLCH design tokens), admin.css, admin-table.css, content.css
├── lib/                  — auth, auth-client, constants, datetime, env, extract-internal-links, password, revision-diff, translations, trpc, utils
├── scripts/              — init.ts, promote.ts, change-password.ts, migrate-html-to-markdown.ts, schedule-jobs.ts
├── server/
│   ├── db/schema/        — auth, cms, categories, portfolio, terms, term-relationships, media, menu, webhooks, audit, custom-fields, forms
│   ├── jobs/             — email queue (BullMQ + nodemailer)
│   ├── routers/          — analytics, audit, auth, categories, cms, content-search, custom-fields, forms, import, job-queue, media, menus, options, portfolio, redirects, revisions, tags, users, webhooks
│   ├── storage/          — pluggable storage (filesystem, S3-compatible)
│   └── utils/            — api-auth, ga4, gdpr, page-seo, seo-routes
├── store/                — toast-store, theme-store, sidebar-store (Zustand)
```

### User Roles & Permissions

**Roles:** `user`, `editor`, `admin`, `superadmin` (4 roles).

**How to check permissions:**
- **Server:** `Policy.for(role).can('section.content')` or `Policy.for(role).canAccessAdmin()`
- **Superadmin-only:** `isSuperAdmin(role)` from `@/engine/policy`
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

- **Slug uniqueness** (`src/engine/crud/admin-crud.ts`): Use `ensureSlugUnique()` — never inline slug uniqueness checks
- **Status counts** (`src/engine/crud/admin-crud.ts`): Use `buildStatusCounts()` for admin tab counts
- **Pagination** (`src/engine/crud/admin-crud.ts`): Use `parsePagination()` + `paginatedResult()`. Standard response shape: `{ results, total, page, pageSize, totalPages }`
- **Admin lists** (`src/engine/crud/admin-crud.ts`): Use `buildAdminList()` — handles conditions, sort, pagination, count in parallel
- **Soft-delete** (`src/engine/crud/admin-crud.ts`): Use `softDelete()`, `softRestore()`, `permanentDelete()`
- **Revisions** (`src/engine/crud/content-revisions.ts`): Use `createRevision()`, `getRevisions()`, `pickSnapshot()`
- **CMS updates** (`src/engine/crud/cms-helpers.ts`): Use `updateWithRevision()` — wraps revision snapshot + slug redirect + update
- **Slugs** (`src/engine/lib/slug.ts`): `slugify()` for URL slugs, `slugifyFilename()` for uploads. Never inline slug regex
- **Translations** (`src/lib/translations.ts`): Use `useBlankTranslations()` in admin components. All user-visible text must be wrapped in `__()` so translations can be enabled later
- **Email** (`src/server/jobs/email`): Use `enqueueEmail()` or `enqueueTemplateEmail()` — never call `sendEmail()` directly. Templates in `emails/` with `{{var}}` placeholders
- **Audit logging** (`src/engine/lib/audit.ts`): Use `logAudit()` — fire-and-forget, never blocks request
- **Webhooks** (`src/engine/lib/webhooks.ts`): Use `dispatchWebhook()` — fire-and-forget webhook dispatch
- **API auth** (`src/server/utils/api-auth.ts`): Use `validateApiKey()`, `checkRateLimit()`, `apiHeaders()` for REST API v1 endpoints
- **Slug redirects** (`src/engine/crud/slug-redirects.ts`): Use `resolveSlugRedirect()` to resolve old slugs to current slugs
- **GDPR** (`src/server/utils/gdpr.ts`): Use `anonymizeUser()` for user data deletion
- **Markdown** (`src/engine/lib/markdown.ts`): Use `htmlToMarkdown()` / `markdownToHtml()` — preserve shortcodes through placeholder strategies
- **Relative time** (`src/lib/datetime.ts`): Use `formatRelativeTime(date, locale?)` — locale-aware via `Intl.RelativeTimeFormat`. Also: `convertUTCToLocal()`, `convertLocalToUTC()`

### Rich Text Editor

PostForm and CategoryForm use Tiptap (`src/engine/components/RichTextEditor.tsx`). Toolbar includes: bold, italic, underline, strikethrough, code, headings (1-3), lists, blockquote, code block, horizontal rule, text alignment, links, images, undo/redo.

Content is stored as **markdown** in `cms_posts.content` / `cms_categories.text`. The RichTextEditor converts markdown→HTML on load (via `markdownToHtml()`) and HTML→markdown on save (via `htmlToMarkdown()`). Both functions preserve shortcodes like `[callout type="info"]...[/callout]` through placeholder strategies. See `src/engine/lib/markdown.ts`.

### Media System

**Upload:** `POST /api/upload` — multipart form, requires auth + `section.media` capability. Files stored in `uploads/` with date-based paths.

**Serving:** `GET /api/uploads/[...path]` — serves files with MIME detection, cache headers, directory traversal protection.

**Media picker:** `MediaPickerDialog` component for selecting images from the media library. Used in PostForm for featured images.

**Storage provider:** `src/server/storage/index.ts` — pluggable (filesystem default, S3-compatible via `src/server/storage/s3.ts`). Set `STORAGE_BACKEND=s3` + S3 env vars for production. Always use `getStorage().url()` for URLs.

### Admin Panel (`/dashboard`)

Section-based RBAC — each sidebar group maps to a `section.*` capability. tRPC routers use `sectionProcedure(section)`.

Dashboard (`max-w-320`, centered) shows: 5 stat cards (pages, posts, categories, users, media) without widget headers, then Content Status + Quick Actions side-by-side with `.admin-widget-header`, GA4Widget (analytics chart + top pages), and Recent Activity feed from `audit.recent` query (last 10 audit log entries with "View all" link to `/dashboard/cms/activity`). Components: `StatCard` (`src/components/admin/StatCard.tsx`), `RecentActivity` (`src/components/admin/RecentActivity.tsx`), `GA4Widget` (`src/components/admin/GA4Widget.tsx`).

AdminSidebar: two-level layout — 48px rail (L1) + collapsible 220px panel (L2). Role badges use CSS classes: `.admin-role-superadmin`, `.admin-role-admin`, `.admin-role-editor`, `.admin-role-user`.

**Admin CSS classes** (`src/engine/styles/admin.css` + `src/engine/styles/admin-table.css`):
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
| `.admin-rail` | Sidebar rail container |
| `.admin-rail-logo` | Rail logo area |
| `.admin-rail-nav` | Rail navigation container |
| `.admin-rail-btn` | Rail icon buttons (cursor: pointer) |
| `.admin-sidebar-link` | Sidebar L2 panel nav links |
| `.admin-badge` | Status badges base |
| `.admin-badge-published` | Published status |
| `.admin-badge-draft` | Draft status |
| `.admin-badge-scheduled` | Scheduled status |
| `.admin-action-btn` | Row action buttons |
| `.admin-search-input` | Search fields |
| `.admin-filter-select` | Filter dropdowns |
| `.admin-input` / `.admin-label` | Form fields |
| `.admin-select` | Select dropdowns (form context) |
| `.admin-textarea` | Textarea fields |
| `.admin-highlight` / `.admin-highlight-strong` | Brand-tinted highlight backgrounds |
| `.admin-status-tabs` / `.admin-status-tab` | Status tab navigation |
| `.admin-pagination` | Pagination controls |
| `.admin-empty-state` | Empty state containers |
| `.admin-sortable-th` | Sortable column headers |
| `.admin-widget-header` | Widget header bar (title + controls, border-bottom, inset bg) |
| `.admin-stat-grid` | Grid container for stat rows |
| `.admin-stat-row` | Label + value row (space-between, border-bottom) |
| `.admin-stat-label` | Stat row label text |
| `.admin-stat-value` | Stat row value (bold, tabular-nums) |
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

Tailwind CSS v4 with `@tailwindcss/typography` for `prose` classes. CSS-first config.

**Design token system:** OKLCH tinted-neutral palette in `src/engine/styles/tokens.css`. Three independent hues: brand `350` (pink/coral), accent `303` (purple), gray `260`/`265` (cool blue-violet). To rebrand: replace brand/accent hues in their scales + `--brand-hue`/`--accent-hue` vars; optionally change gray hue (260 is a good universal neutral); update hardcoded `260` in dark surface tokens and `admin.css` (rail, L2). Semi-transparent brand tints use decomposed `oklch(L C var(--brand-hue) / alpha)` — NOT `color-mix()` or `oklch(from ...)`, which don't work with CSS variables in Lightning CSS.

**File structure:**
- `src/engine/styles/tokens.css` — OKLCH design tokens (brand scale, tinted grays, semantic colors, surfaces, text, borders, shadows, radius, motion)
- `src/engine/styles/admin.css` — admin panel core classes (cards, buttons, sidebar, typography)
- `src/engine/styles/admin-table.css` — table, badge, form, pagination, role badge classes
- `src/engine/styles/content.css` — CMS content rendering classes (`.cms-content`, `.cms-title`, `.cms-post-card`)
- `src/app/globals.css` — imports Tailwind, typography, engine tokens, content CSS

**Layer order:** `@layer theme, base, components, utilities;` — every CSS file must declare this.

Use `cn()` from `@/lib/utils` for conditional classes — never template literals or raw `clsx()`.

### Catch-All CMS Route (`[...slug]`)

`src/app/(public)/[...slug]/page.tsx` — handles ALL CMS content.

URL patterns:
- `/privacy-policy` → page
- `/blog/my-post` → blog post
- `/portfolio/my-project` → portfolio item (project details + description)
- `/category/tech` → category (shows description + posts in category)
- `/tag/nextjs` → tag (shows posts with that tag, paginated via `?page=N`)

Supports preview mode via `?preview=<token>`.

### Content Search

`contentSearch.search` — searches across all published content types (posts + categories + tags + portfolio) by title/slug. Returns `{ type, id, title, url }` results. Used by the rich text editor for internal link picking. Requires `section.content` capability.

### Post-Taxonomy Relationships

Many-to-many via `cms_term_relationships` (polymorphic). CMS router `create`/`update` accept `categoryIds` and `tagIds` arrays. `get` returns both. `listPublished` accepts optional `categoryId` or `tagId` to filter posts by taxonomy term.

PostForm includes: category checkbox selector + tag autocomplete input (`TagInput`) in sidebar. Tags support create-on-enter via `tags.getOrCreate` mutation.

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
