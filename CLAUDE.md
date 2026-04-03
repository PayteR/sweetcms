# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SweetCMS is an open-source, AI agent-driven T3 SaaS starter with integrated CMS: Next.js 16 (App Router) + tRPC + Drizzle ORM + Better Auth. PostgreSQL with UUID primary keys. Designed for AI-assisted development — this CLAUDE.md is the product differentiator. Clone for each new SaaS/social/AI app project. CMS stays global (marketing site); SaaS primitives (orgs, billing, notifications, real-time) scope to organizations.

**Tagline:** AI Agent-driven T3 SaaS starter with integrated CMS (Next.js + tRPC + Drizzle)

## Development

- **Package manager:** `bun`
- **Dev server:** `bun run dev` — custom server with Turbopack (port 3000)
- **First-time setup:** `bun run init` — creates DB, runs migrations, creates superadmin, seeds defaults (3 pages, 4 blog posts, 3 categories, 4 tags, 2 portfolio items, 3 showcase items)
- **Promote user:** `bun run promote <email>` — promote user to superadmin
- **Change password:** `bun run change-password <email>` — change a user's password
- **Entry point:** `src/app/` (Next.js App Router with locale-prefix routing)
- **Custom server:** `server.ts` — starts Next.js (Turbopack in dev) + BullMQ workers + WebSocket server (controlled by `SERVER_ROLE`)
- **Database:** `bun run db:generate` after schema changes, `bun run db:migrate` to apply, `bun run db:studio` for DB viewer
- **Type check:** `bun run typecheck`
- **Tests:** `bun test` — Vitest-compatible (bun test runner) with jsdom environment. Tests in `__tests__/` directories. **Note:** Use `asMock(fn)` from `@/test-utils` instead of `vi.mocked()` (which is a vitest-only API). Also avoid `vi.waitFor()`, `vi.stubGlobal()`, `vi.importActual()` — these are vitest-only APIs not available in bun's test runner.
- **Environment config:** Zod-validated env vars in `src/lib/env.ts`

## Architecture Overview

### Engine / Project Boundary

`src/engine/` contains reusable CMS infrastructure — do not modify per-project. It is a `git subtree` from `sweetcms-engine` repo (`github.com/PayteR/sweetcms-engine`).

**Engine subtree commands:**
- Pull updates: `git subtree pull --prefix=src/engine git@github.com:PayteR/sweetcms-engine.git main --squash`
- Push changes: `git subtree push --prefix=src/engine git@github.com:PayteR/sweetcms-engine.git main`

`src/config/`, `src/server/`, `src/app/` are project-specific — customize freely. `src/components/admin/` has project-specific forms (PostForm, CategoryForm, PortfolioForm, ShowcaseForm, TermForm), list views (CmsListView), layout (AdminSidebar, DashboardWidgetGrid), and shortcode nodes. `src/components/public/` has auth-dependent components (UserMenu, SocialLoginButtons) and project-specific UI (ContactForm, CreateOrgCard, ShowcaseFeed).

**Engine provides:** config interfaces + factory helpers + admin-nav helpers, types (PostType, ContentStatus, shortcodes), RBAC policy, CRUD utils (admin-crud, drizzle-utils, taxonomy-helpers, cms-helpers, content-revisions, slug-redirects, page-seo), lib utils (slug, markdown, audit, webhooks, logger, datetime, redis, rate-limit, trpc-rate-limit, api-auth, seo-routes, ga4, gdpr, queue, ws-client, ws-channels, stats-cache, translations, shortcodes-parser, shortcode-utils, locale, locale-server, db-queue, queue-adapter), payment services (subscription-service, discount-service, feature-gate), hooks (form state, list state, autosave, bulk actions, useLocale), shared components (CmsFormShell, RichTextEditor, SEOFields, TagInput, MediaPickerDialog, CustomFieldsEditor, RevisionHistory, BulkActionBar, CommandPalette, SlideOver, ConfirmDialog, Toaster, InternalLinkDialog, FallbackRadio, DashboardShell, LocaleLink, LanguageSwitcher, PreferencesHydrator, MenuBuilder, RecentActivity, ContentStatusWidget, MobileMenu, ThemeToggle, NotificationBell, PostAttachments, GA4Widget, OrgSwitcher, ContentCalendar, TranslationBar, SeoOverridesDialog, DashboardConfig, PostCard, TagCloud, DynamicNav, BlogSidebar, ShortcodeRenderer, FaqAccordion, AccountSidebar, PricingToggle, shortcodes/CalloutBlock, shortcodes/CtaBlock, shortcodes/YoutubeEmbed, shortcodes/GalleryBlock), styles (tokens, admin CSS), stores (preferences-store, sidebar-store, toast-store, theme-store), test-utils (asMock).

**Project provides:** content type data (`src/config/cms.ts`), taxonomy data (`src/config/taxonomies.ts`), admin navigation data (`src/config/admin-nav.ts`), dashboard widget registry + components (`src/config/dashboard-widgets.tsx`), shortcode component registry (`src/config/shortcodes.ts`), billing plans (`src/config/plans.ts`), pricing display config (`src/config/pricing.ts`), DB schema, tRPC routers, form components (PostForm, CategoryForm, etc.), CmsListView, AdminSidebar, DashboardWidgetGrid, auth-dependent components (UserMenu, SocialLoginButtons), routes, public UI.

**Import rule:** project imports from `@/engine/*`. Engine accepts cross-boundary imports from `@/server/db`, `@/server/db/schema/*`, `@/lib/trpc/client`, `@/lib/trpc/server`, `@/lib/utils`, `@/lib/constants`, `@/config/plans`.

**To rebrand:** (1) In `tokens.css`: find-replace `350` with your brand hue and `303` with your accent hue in the brand/accent scales; update `--brand-hue` and `--accent-hue` in `:root`; optionally change gray hue `260`/`265`; update `--gradient-brand` L/C values; edit the semantic defaults (surfaces, text, borders, shadows) in `:root` and `html.dark`. (2) To diverge the public frontend: add overrides in `tokens-public.css`. (3) To diverge the admin panel: add overrides in `tokens-admin.css`. (4) Update hardcoded `260` in dark surface tokens and in `admin.css` (rail, L2 panel backgrounds).

### tRPC Procedures & Usage

**Usage:** Client: `trpc.cms.list.useQuery()` / `trpc.cms.create.useMutation()` from `@/lib/trpc/client`. Server: `const api = await serverTRPC()` from `@/lib/trpc/server`. Client uses `httpBatchStreamLink`.

**Procedure types:** `publicProcedure`, `protectedProcedure`, `staffProcedure`, `sectionProcedure(section)`, `superadminProcedure`.

**Routers (`src/server/routers/_app.ts`):** `analytics`, `audit`, `auth`, `billing`, `categories`, `cms`, `contentSearch`, `customFields`, `forms`, `import`, `jobQueue`, `media`, `menus`, `notifications`, `options`, `organizations`, `portfolio`, `redirects`, `revisions`, `showcase`, `tags`, `users`, `webhooks`.

### Database

PostgreSQL only. All CMS tables prefixed `cms_`. UUID primary keys via `gen_random_uuid()`. Drizzle ORM with schema in `src/server/db/schema/`.

**Tables:**
- `user`, `session`, `account`, `verification` — Better Auth standard
- `cms_posts` — pages and blog posts (type discriminator: `PostType.PAGE=1`, `PostType.BLOG=2`)
- `cms_post_attachments` — file attachments per post
- `cms_categories` — standalone category table (rich: SEO, content, icon, jsonLd)
- `cms_portfolio` — portfolio items (custom table: clientName, projectUrl, techStack jsonb, completedAt, featuredImage, SEO fields, revision history)
- `cms_showcase` — swipeable showcase cards (custom table: cardType enum video/image/richtext, mediaUrl, thumbnailUrl, sortOrder, SEO fields, revision history)
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
- `organization` — Better Auth organizations (name, slug, logo, metadata). Text PKs.
- `member` — org membership (organizationId, userId, role). Text PKs.
- `invitation` — org invitations (organizationId, email, role, status, inviterId, expiresAt)
- `saas_subscriptions` — Stripe subscriptions per org (stripeCustomerId, stripeSubscriptionId, planId, status, period dates, cancelAtPeriodEnd)
- `saas_subscription_events` — Stripe webhook idempotency log (stripeEventId UNIQUE, type, data JSONB)
- `saas_notifications` — in-app notifications (userId, orgId, type, category, title, body, actionUrl, read, readAt, expiresAt)

### Content Type Registry

`src/config/cms.ts` — single source of truth for all CMS content types.

Content types: `page` (PostType.PAGE), `blog` (PostType.BLOG), `portfolio` (separate table), `showcase` (separate table, swipeable vertical feed), `category` (separate table), `tag` (uses `cms_terms`).

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

**To add a new shortcode:**
1. Create component in `src/engine/components/shortcodes/` (or project-specific location)
2. Register in `src/config/shortcodes.ts` — add entry to `SHORTCODE_COMPONENTS` map
3. Engine's `ShortcodeRenderer` accepts `components` prop (no engine edit needed)

**To add a new custom field type:**
1. Engine's `CustomFieldsEditor` accepts optional `fieldRenderers` prop — pass custom renderers to override/extend built-in types (text, textarea, number, boolean, select, date, url, color)
2. No engine edit needed — built-in defaults cover standard types

**To add a new dashboard widget:**
1. Create widget component (accepts `{ dragHandle?: ReactNode }` prop)
2. Add `DashboardWidgetDef` entry in `src/config/dashboard-widgets.tsx`
3. Add component to `DASHBOARD_WIDGET_COMPONENTS` map in same file

### File Structure

```
src/
├── app/
│   ├── (public)/         — public-facing content + customer auth
│   │   ├── account/      — customer account pages (overview, settings, security, billing)
│   │   ├── blog/         — blog list page
│   │   ├── forgot-password/ — customer password reset request
│   │   ├── login/        — customer login (email/password + social)
│   │   ├── portfolio/    — portfolio list page
│   │   ├── pricing/      — public pricing page (plan cards, FAQ)
│   │   ├── register/     — customer registration (gated by NEXT_PUBLIC_REGISTRATION_ENABLED)
│   │   ├── reset-password/ — customer password reset (token-based)
│   │   ├── search/       — content search page
│   │   └── [...slug]/    — catch-all CMS route (pages, posts, categories, tags, portfolio, showcase)
│   ├── (showcase)/       — showcase feed (own layout: no header/footer, floating back button)
│   │   └── showcase/     — swipeable vertical feed page (/showcase)
│   ├── api/
│   │   ├── auth/         — Better Auth route handler
│   │   ├── feed/         — RSS feeds (blog, tag)
│   │   ├── forms/        — form submission API
│   │   ├── gdpr-export/  — GDPR user data export
│   │   ├── trpc/         — tRPC route handler
│   │   ├── upload/       — file upload endpoint
│   │   ├── uploads/      — file serving (static uploads)
│   │   ├── v1/           — REST API v1 (posts, categories, tags, menus) + OpenAPI spec
│   │   └── webhooks/     — Stripe webhook handler
│   ├── dashboard/        — admin panel
│   │   ├── (auth)/       — admin auth (no sidebar)
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   ├── forgot-password/
│   │   │   └── reset-password/
│   │   ├── (panel)/      — admin panel (sidebar + shell)
│   │   │   ├── cms/
│   │   │   │   ├── [section]/ — CMS list/edit pages
│   │   │   │   ├── activity/  — audit activity log
│   │   │   │   ├── calendar/  — content calendar view
│   │   │   │   ├── menus/     — menu management
│   │   │   │   └── redirects/ — slug redirect management
│   │   │   ├── forms/        — form builder & submissions
│   │   │   ├── media/        — media library
│   │   │   ├── notifications/ — notification list
│   │   │   ├── organizations/ — org management (members, invitations)
│   │   │   ├── settings/     — site settings, custom-fields, email-templates, import, job-queue, webhooks, billing
│   │   │   └── users/        — user management
│   │   └── assets/       — admin CSS
│   ├── robots.ts         — robots.txt (disallows /dashboard/, /api/webhooks/, /api/health)
│   └── sitemap.ts        — dynamic sitemap generation
├── components/
│   ├── admin/            — PostForm, CategoryForm, PortfolioForm, ShowcaseForm, TermForm, CmsListView, AdminSidebar, DashboardWidgetGrid, QuickActionsWidget, TaxonomyOverview, shortcodes/
│   ├── public/           — ContactForm, UserMenu, SocialLoginButtons, CreateOrgCard, ShowcaseFeed, RefCookieCapture
│   └── ui/               — ConfirmDialog (re-export)
├── config/               — cms.ts (content types), taxonomies.ts (taxonomy declarations), admin-nav.ts (navigation data), plans.ts (billing plans), pricing.ts (pricing display), site.ts (site config)
├── engine/
│   ├── config/           — ContentTypeDeclaration, TaxonomyDeclaration interfaces + factory helpers, admin-nav helpers
│   ├── crud/             — admin-crud, drizzle-utils, taxonomy-helpers, cms-helpers, content-revisions, slug-redirects, page-seo
│   ├── hooks/            — useCmsFormState, useCmsAutosave, useListViewState, useBulkActions, useLocale, etc.
│   ├── policy/           — Role, Policy, Capability, isSuperAdmin
│   ├── components/       — CmsFormShell, RichTextEditor, SEOFields, TagInput, MediaPickerDialog, CommandPalette, SlideOver, ConfirmDialog, Toaster, InternalLinkDialog, FallbackRadio, DashboardShell, LocaleLink, LanguageSwitcher, PreferencesHydrator, MenuBuilder, RecentActivity, ContentStatusWidget, MobileMenu, ThemeToggle, NotificationBell, PostAttachments, GA4Widget, OrgSwitcher, ContentCalendar, TranslationBar, SeoOverridesDialog, DashboardConfig, PostCard, TagCloud, DynamicNav, BlogSidebar, ShortcodeRenderer, FaqAccordion, AccountSidebar, PricingToggle, shortcodes/
│   ├── lib/              — slug, markdown, audit, webhooks, logger, datetime, redis, rate-limit, trpc-rate-limit, api-auth, seo-routes, ga4, gdpr, queue, ws-client, ws-channels, stats-cache, translations, shortcodes-parser, shortcode-utils, locale, locale-server
│   ├── store/            — preferences-store, sidebar-store, toast-store, theme-store
│   ├── types/            — PostType, ContentStatus, FileType, ContentSnapshot, shortcodes, organization, billing, realtime, notifications
│   └── styles/           — tokens.css (OKLCH design tokens), admin.css, admin-table.css, content.css
├── lib/                  — auth, auth-client, constants, env, locale (re-export), locale-server (re-export), password, translations (re-export), trpc, utils
├── scripts/              — init.ts, promote.ts, change-password.ts, migrate-html-to-markdown.ts, schedule-jobs.ts
├── server/
│   ├── db/schema/        — auth, cms, categories, portfolio, showcase, terms, term-relationships, media, menu, webhooks, audit, custom-fields, forms, organization, billing, notifications
│   ├── jobs/             — email queue (BullMQ + nodemailer), content queue
│   ├── lib/              — stripe, ws (WebSocket server), notifications
│   ├── routers/          — analytics, audit, auth, billing, categories, cms, content-search, custom-fields, forms, import, job-queue, media, menus, notifications, options, organizations, portfolio, redirects, revisions, showcase, tags, users, webhooks
│   └── storage/          — pluggable storage (filesystem, S3-compatible)
├── store/                — toast-store (re-export)
```

### User Roles & Permissions

**Roles:** `user`, `editor`, `admin`, `superadmin` (4 roles).

**How to check permissions:**
- **Server:** `Policy.for(role).can('section.content')` or `Policy.for(role).canAccessAdmin()`
- **Superadmin-only:** `isSuperAdmin(role)` from `@/engine/policy`
- **Never** use hardcoded role strings like `role === 'admin'` — always use `Role.*` consts or `Policy.for(role).can(...)`
- **Invalid roles:** `Policy.for()` normalizes unknown/empty/null to `Role.USER` (fail-closed)

**Admin sections:** `dashboard`, `content`, `media`, `users`, `settings`, `billing`, `organizations`

**Section capabilities by role:**
| Capability | editor | admin | superadmin |
|---|---|---|---|
| section.dashboard | yes | yes | yes |
| section.content | yes | yes | yes |
| section.media | yes | yes | yes |
| section.users | — | yes | yes |
| section.settings | — | yes | yes |
| section.billing | — | yes | yes |
| section.organizations | — | yes | yes |
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
- **Translations** (`src/engine/lib/translations.ts`): Use `useBlankTranslations()` in admin components. All user-visible text must be wrapped in `__()` so translations can be enabled later
- **Email** (`src/server/jobs/email`): Use `enqueueEmail()` or `enqueueTemplateEmail()` — never call `sendEmail()` directly. Templates in `emails/` with `{{var}}` placeholders
- **Logger** (`src/engine/lib/logger.ts`): Use `createLogger(prefix)` for structured logging. JSON in production, human-readable in dev. All fire-and-forget operations must log errors, never silently swallow them
- **Audit logging** (`src/engine/lib/audit.ts`): Use `logAudit()` — fire-and-forget, logs errors via logger
- **Webhooks** (`src/engine/lib/webhooks.ts`): Use `dispatchWebhook()` — fire-and-forget, logs delivery failures via logger
- **API auth** (`src/engine/lib/api-auth.ts`): Use `validateApiKey()`, `await checkRateLimit()`, `apiHeaders()` for REST API v1 endpoints (note: `checkRateLimit` is now async/Redis-backed)
- **API route wrapper** (`src/engine/lib/api-route.ts`): Use `withApiRoute(request, handler)` for v1 REST routes — wraps auth + rate-limit + try/catch. Also: `parseApiPagination(url)`, `paginatedApiResponse(data, meta)`
- **Fetch or 404** (`src/engine/crud/admin-crud.ts`): Use `fetchOrNotFound(db, table, id, entityName)` — select + throw NOT_FOUND. Never inline this pattern
- **Copy slug** (`src/engine/crud/admin-crud.ts`): Use `generateCopySlug()` for duplicate operations — never inline the 20-attempt loop
- **Status update** (`src/engine/crud/admin-crud.ts`): Use `updateContentStatus()` — handles auto-publishedAt logic. Never inline
- **Translation siblings** (`src/engine/crud/admin-crud.ts`): Use `getTranslationSiblings()` — never inline the translationGroup lookup
- **Translation copy** (`src/engine/crud/admin-crud.ts`): Use `prepareTranslationCopy()` for duplicateAsTranslation — handles translation group creation, unique slug, preview token. Never inline this infrastructure
- **Bulk export** (`src/engine/crud/admin-crud.ts`): Use `serializeExport(items, headers, format)` for JSON/TSV export
- **Router Zod schemas** (`src/engine/crud/router-schemas.ts`): Use `adminListInput`, `updateStatusInput`, `duplicateAsTranslationInput`, `exportBulkInput` — never inline these Zod shapes
- **Slug auto-generation** (`src/engine/hooks/useSlugAutoGenerate.ts`): Use `useSlugAutoGenerate(source, isNew, slugManual, setSlug)` in all form components
- **Autosave recovery** (`src/engine/hooks/useCmsFormState.ts`): Use `narrowRecoveredData(recovered, defaults)` — never manually cast recovered fields
- **Slug redirects** (`src/engine/crud/slug-redirects.ts`): Use `resolveSlugRedirect()` to resolve old slugs to current slugs
- **GDPR** (`src/engine/lib/gdpr.ts`): Use `anonymizeUser()` for user data deletion
- **Markdown** (`src/engine/lib/markdown.ts`): Use `htmlToMarkdown()` / `markdownToHtml()` — preserve shortcodes through placeholder strategies
- **Relative time** (`src/engine/lib/datetime.ts`): Use `formatRelativeTime(date, locale?)` — locale-aware via `Intl.RelativeTimeFormat`. Also: `convertUTCToLocal()`, `convertLocalToUTC()`
- **Rate limiting** (`src/engine/lib/rate-limit.ts`): Use `checkRateLimit(redis, key, config)` — sliding window via Redis sorted sets. Fail-open if Redis unavailable
- **Redis** (`src/engine/lib/redis.ts`): Use `getRedis()`, `getSubscriber()`, `getPublisher()`. Lazy init, null if no REDIS_URL
- **Notifications** (`src/server/lib/notifications.ts`): Use `sendNotification()`, `sendOrgNotification()`, `sendBulkNotification()` — fire-and-forget (DB + WebSocket)
- **Stripe** (`src/server/lib/stripe.ts`): Use `getStripe()` (null if no key), `getOrCreateStripeCustomer()`, `createCheckoutSession()`, `createPortalSession()`
- **WebSocket** (`src/server/lib/ws.ts`): Use `broadcastToChannel()`, `sendToUser()`, `sendToOrg()` — fire-and-forget real-time delivery

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

Dashboard (`max-w-320`, centered) shows: 5 stat cards (pages, posts, categories, users, media) without widget headers, then Content Status + Quick Actions side-by-side with `.widget-header`, GA4Widget (analytics chart + top pages), and Recent Activity feed from `audit.recent` query (last 10 audit log entries with "View all" link to `/dashboard/cms/activity`). Components: `StatCard` (`src/components/admin/StatCard.tsx`), `RecentActivity` (`src/components/admin/RecentActivity.tsx`), `GA4Widget` (`src/components/admin/GA4Widget.tsx`).

AdminSidebar: two-level layout — 48px rail (L1) + collapsible 220px panel (L2). Role badges use CSS classes: `.role-superadmin`, `.role-admin`, `.role-editor`, `.role-user`.

**Admin CSS classes** (`src/engine/styles/admin.css` + `src/engine/styles/admin-table.css`). Admin CSS is only loaded in the dashboard route (`dashboard/layout.tsx`), so no scoping attribute is needed — file-level separation prevents collisions with identically-named content CSS classes (`.btn`, `.input`, etc.).
| Class | Usage |
|---|---|
| `.card` | Card containers. Add padding via utility |
| `.thead` | Table header row background |
| `.th` | Table header cells |
| `.td` | Table data cells |
| `.tr` | Table rows (hover highlight) |
| `.h2` | Section headings |
| `.btn` | Base button class |
| `.btn-primary` | Primary action button |
| `.btn-secondary` | Secondary button |
| `.btn-danger` | Danger/delete button |
| `.btn-success` | Success/confirm button |
| `.btn-sm` | Small button variant |
| `.rail` | Sidebar rail container |
| `.rail-logo` | Rail logo area |
| `.rail-nav` | Rail navigation container |
| `.rail-btn` | Rail icon buttons (cursor: pointer) |
| `.sidebar-link` | Sidebar L2 panel nav links |
| `.badge` | Status badges base |
| `.badge-published` | Published status |
| `.badge-draft` | Draft status |
| `.badge-scheduled` | Scheduled status |
| `.action-btn` | Row action buttons |
| `.search-input` | Search fields |
| `.filter-select` | Filter dropdowns |
| `.input` / `.label` | Form fields |
| `.select` | Select dropdowns (form context) |
| `.textarea` | Textarea fields |
| `.highlight` / `.highlight-strong` | Brand-tinted highlight backgrounds |
| `.status-tabs` / `.status-tab` | Status tab navigation |
| `.pagination` | Pagination controls |
| `.empty-state` | Empty state containers |
| `.sortable-th` | Sortable column headers |
| `.widget-header` | Widget header bar (title + controls, border-bottom, inset bg) |
| `.stat-grid` | Grid container for stat rows |
| `.stat-row` | Label + value row (space-between, border-bottom) |
| `.stat-label` | Stat row label text |
| `.stat-value` | Stat row value (bold, tabular-nums) |
| `.role-badge` | Role badges (superadmin/admin/editor/user) |

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

**Design token system:** OKLCH tinted-neutral palette split into 3 files. Three independent hues: brand `350` (pink/coral), accent `303` (purple), gray `260`/`265` (cool blue-violet). Semi-transparent brand tints use decomposed `oklch(L C var(--brand-hue) / alpha)` — NOT `color-mix()` or `oklch(from ...)`, which don't work with CSS variables in Lightning CSS.

**File structure (base + override inheritance):**
- `src/engine/styles/tokens.css` — `@theme` color scales + `:root` ALL defaults (hues, radius, motion, gradient, overlay, surfaces, text, borders, shadows) + `html.dark` overrides. Loaded globally via `globals.css`.
- `src/engine/styles/tokens-public.css` — `:root` overrides for public pages. Initially empty (inherits all defaults from tokens.css). Loaded in `(public)/layout.tsx` and `(auth)/layout.tsx`.
- `src/engine/styles/tokens-admin.css` — `:root` overrides for admin. Initially empty (inherits all defaults from tokens.css). Loaded via `admin.css`.
- `src/engine/styles/admin.css` — admin panel core classes (cards, buttons, sidebar, typography); imports tokens-admin.css
- `src/engine/styles/admin-table.css` — table, badge, form, pagination, role badge classes + admin autofill
- `src/engine/styles/content.css` — public component classes (header, footer, buttons, forms, content) + public autofill; loaded in `(public)/layout.tsx` and `(auth)/layout.tsx`, NOT globally
- `src/app/globals.css` — imports Tailwind, typography, tokens.css, overlay.css (NOT tokens-public.css)

**Layer order:** `@layer theme, base, components, utilities;` — every CSS file must declare this.

Use `cn()` from `@/lib/utils` for conditional classes — never template literals or raw `clsx()`.

### Catch-All CMS Route (`[...slug]`)

`src/app/(public)/[...slug]/` — handles ALL CMS content. Split into focused modules:

- `page.tsx` — thin orchestrator: resolves slug, looks up renderer from registry, generates metadata
- `renderer-registry.ts` — `registerContentRenderer(id, config)` / `getContentRenderer(id)`. Open-closed: adding a content type = registering here, no if/else
- `register-renderers.tsx` — side-effect module that registers all content type renderers (page, blog, tag, portfolio, category)
- `resolve.ts` — pure routing helpers: `resolveSlug()`, `buildAlternates()`
- `queries.ts` — shared DB queries: `getAncestors()`, translation sibling lookups
- `renderers/PostDetail.tsx` — page + blog post rendering (parallel: tags, related, ancestors)
- `renderers/TagDetail.tsx` — tag detail + paginated posts
- `renderers/PortfolioDetail.tsx` — portfolio item detail
- `renderers/ShowcaseDetail.tsx` — showcase item detail
- `renderers/CategoryDetail.tsx` — category detail + posts in category

URL patterns:
- `/privacy-policy` → page
- `/blog/my-post` → blog post
- `/portfolio/my-project` → portfolio item (project details + description)
- `/showcase/my-card` → showcase item (individual card detail)
- `/category/tech` → category (shows description + posts in category)
- `/tag/nextjs` → tag (shows posts with that tag, paginated via `?page=N`)

Supports preview mode via `?preview=<token>`.

### Content Search

`contentSearch.search` — searches across all published content types (posts + categories + tags + portfolio) by title/slug. Returns `{ type, id, title, url }` results. Used by the rich text editor for internal link picking. Requires `section.content` capability.

### Post-Taxonomy Relationships

Many-to-many via `cms_term_relationships` (polymorphic). CMS router `create`/`update` accept `categoryIds` and `tagIds` arrays. `get` returns both. `listPublished` accepts optional `categoryId` or `tagId` to filter posts by taxonomy term.

PostForm includes: category checkbox selector + tag autocomplete input (`TagInput`) in sidebar. Tags support create-on-enter via `tags.getOrCreate` mutation.

### Auth Pages

**Admin auth** lives under `/dashboard/` (no sidebar, centered card layout):

- `/dashboard/login` — email/password sign in with "Forgot password?" link
- `/dashboard/register` — sign up (gated by `NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED`, default: `false`)
- `/dashboard/forgot-password` — request password reset (server action → `auth.api.requestPasswordReset`)
- `/dashboard/reset-password?token=...` — set new password via `authClient.resetPassword`

**Customer auth** lives under `(public)/` (public layout):

- `/login` — email/password + social login (Google, Discord). Redirects to `/account` on success.
- `/register` — email/password + social. Gated by `NEXT_PUBLIC_REGISTRATION_ENABLED` (default: `true`). Terms checkbox.
- `/forgot-password` — customer password reset request (server action → `auth.api.forgetPassword`)
- `/reset-password?token=...` — set new password via `authClient.resetPassword`

**Account pages** (`/account/*`) — auth-guarded layout with sidebar:
- `/account` — overview (avatar, name, email, quick links)
- `/account/settings` — profile (name), GDPR (download data, delete account)
- `/account/security` — change password, active sessions, revoke sessions
- `/account/billing` — current plan, Stripe portal, upgrade

**Components:** `SocialLoginButtons` (Google/Discord, conditional on env vars), `UserMenu` (header avatar dropdown or "Sign In" link), `AccountSidebar` (client nav with active state).

Proxy (`src/proxy.ts`) allows dashboard auth paths without session cookie; all other `/dashboard/*` paths redirect to `/dashboard/login`. `/account` paths require session cookie (redirect to `/login`).

### i18n / Locale Routing

**Approach:** Proxy-rewrite with locale prefix — no `[locale]` route segment. Default locale (`en`) has no prefix; non-default locales use prefix (`/de/blog/post`). Dashboard is unaffected.

```
/blog/my-post          → English (no rewrite, x-locale: en)
/de/blog/my-post       → proxy rewrites to /blog/my-post, x-locale: de
/es/category/tech      → proxy rewrites to /category/tech, x-locale: es
```

**Config:** `src/lib/constants.ts` — `LOCALES`, `DEFAULT_LOCALE`, `LOCALE_LABELS`. Single source of truth.

**Proxy:** `src/proxy.ts` — detects locale prefix in first path segment, rewrites URL (strips prefix), sets `x-locale` header. Matcher excludes `api`, `_next`, `uploads`, `favicon.ico`, `sitemap.xml`, `robots.txt`.

**Helpers:**
- `localePath(path, locale)` (`src/lib/locale.ts`) — prepends locale prefix for non-default locales. Pure function, shared by server + client code.
- `getLocale()` (`src/lib/locale-server.ts`) — server-side, reads `x-locale` header via `headers()`. Use in server components + `generateMetadata`.
- `useLocale()` (`src/lib/useLocale.ts`) — client hook, detects locale from `usePathname()` first segment.

**Components:**
- `LocaleLink` (`src/components/public/LocaleLink.tsx`) — client `<Link>` wrapper using `useLocale()` + `localePath()`.
- `LanguageSwitcher` (`src/components/public/LanguageSwitcher.tsx`) — header dropdown, only renders when `LOCALES.length > 1`.

**Key rules:**
- All public `<Link>` hrefs must use `localePath()` (server) or `<LocaleLink>` (client)
- All public queries must pass `lang: locale` (from `getLocale()` or `useLocale()`)
- `<html lang>` is dynamic — reads `x-locale` header in root layout
- hreflang alternates in `generateMetadata` use `translationGroup` DB column for actual sibling lookup
- Sitemap generates per-locale entries with `alternates.languages`
- RSS feeds accept `?lang=` query param

**Tradeoff:** The `x-locale` header via `headers()` makes all public pages dynamic (no ISR/SSG). Acceptable for a CMS where content is DB-driven, but worth noting. To restore static generation for single-locale deployments, set `LOCALES` to a single entry — the proxy will pass through without rewriting.

**To add a new locale:**
1. Add to `LOCALES` array and `LOCALE_LABELS` in `src/lib/constants.ts`
2. Add DeepL mapping in `src/server/translation/deepl-languages.ts` (if auto-translation desired)
3. No other code changes needed — proxy, helpers, and components read from `LOCALES` dynamically

### Email System

BullMQ queue with nodemailer transport. Templates in `emails/` directory with HTML comment subjects.

- `enqueueEmail({ to, subject, html })` — raw email
- `enqueueTemplateEmail(to, 'welcome', { appUrl })` — templated email
- Password reset emails sent via Better Auth `sendResetPassword` callback
- Templates: `welcome.html`, `password-reset.html`
- Worker starts in `server.ts` when `SERVER_ROLE` includes workers

### SERVER_ROLE (Production Scaling)

| Role | Next.js | tRPC | BullMQ | WebSocket | Use case |
|---|---|---|---|---|---|
| `all` (default) | yes | yes | yes | yes | Development, single-instance |
| `frontend` | yes | — | — | — | Pages only |
| `api` | yes | yes | — | yes | tRPC API + WebSocket |
| `worker` | — | — | yes | — | Background jobs only |

### Redis & Rate Limiting

**Redis singleton** (`src/engine/lib/redis.ts`): `getRedis()`, `getSubscriber()`, `getPublisher()`. Lazy init, graceful if no `REDIS_URL`. Each returns a dedicated connection (pub/sub connections are exclusive in ioredis).

**Rate limiting** (`src/engine/lib/rate-limit.ts`): Sliding window via Redis sorted sets (ZADD/ZRANGEBYSCORE). `checkRateLimit(redis, key, config) → { allowed, remaining, retryAfterMs }`. Fail-open if Redis unavailable.

**tRPC middleware** (`src/engine/lib/trpc-rate-limit.ts`): Applied to `publicProcedure` (100 req/min per IP) and `protectedProcedure` (200 req/min per user). Throws `TOO_MANY_REQUESTS`.

**REST API**: `src/engine/lib/api-auth.ts` — `checkRateLimit()` is now async and Redis-backed. All v1 routes use `await`. OpenAPI spec at `GET /api/v1/openapi`.

**Health check**: `GET /api/health` — checks DB (SELECT 1) and Redis (PING) connectivity. Returns `200 { status: "healthy", uptime, checks }` or `503 { status: "degraded", ... }`. Error details stripped in production. Excluded from robots.txt.

### Organizations (Multi-tenancy)

Better Auth `organization()` plugin. Tables: `organization`, `member`, `invitation` (text PKs, Better Auth convention). Session includes `activeOrganizationId`.

**Router:** `src/server/routers/organizations.ts` — `protectedProcedure`: list, get, create, update, delete, setActive, inviteMember, listMembers, removeMember, leave, listInvitations, cancelInvitation, acceptInvitation.

**Components:** `OrgSwitcher` (admin rail dropdown), org management page at `/dashboard/organizations`.

**Auth config:** `src/lib/auth.ts` — `organization()` plugin with `allowUserToCreateOrganization: true`, `creatorRole: 'owner'`, `membershipLimit: 100`. Invitation emails via `enqueueTemplateEmail`.

**Client:** `src/lib/auth-client.ts` — `organizationClient()` plugin.

**Context:** `ctx.activeOrganizationId` available in all tRPC procedures.

### Stripe Billing

All guarded by `STRIPE_SECRET_KEY` — disabled if not configured. Organization-scoped (subscriptions belong to orgs, not users).

**Config:** `src/config/plans.ts` — plan definitions (free/starter/pro/enterprise). `getPlan(id)`, `getPlanByStripePriceId()`. Feature flags + limits per plan. `src/config/pricing.ts` — display config for public pricing page.

**Schema:** `src/server/db/schema/billing.ts` — `saas_subscriptions` (orgId→Stripe mapping, plan, status, period), `saas_subscription_events` (idempotency log).

**Stripe lib:** `src/server/lib/stripe.ts` — `getStripe()` (lazy, null if no key), `requireStripe()`, `getOrCreateStripeCustomer()`, `createCheckoutSession()`, `createPortalSession()`, `getActiveSubscription()`.

**Router:** `src/server/routers/billing.ts` — `getPlans`, `getSubscription`, `createCheckoutSession`, `createPortalSession`. Org owner/admin required for mutations.

**Webhook:** `src/app/api/webhooks/stripe/route.ts` — signature verification, idempotency via event log. Handles: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed`.

**Pages:** `/pricing` (public), `/dashboard/settings/billing` (admin).

### WebSocket / Real-time

`ws` package, attached to HTTP server via upgrade event. Only on `/ws` path. Auth via session cookie on upgrade.

**Server:** `src/server/lib/ws.ts` — `initWebSocketServer(server)`, `broadcastToChannel()`, `sendToUser()`, `sendToOrg()`, `shutdownWebSocket()`. Heartbeat 30s ping/pong. Redis pub/sub for multi-instance via `getSubscriber()`/`getPublisher()`.

**Channels** (`src/server/lib/ws-channels.ts`): `user:<id>` (own only), `org:<orgId>` (authenticated), `content:<id>` (public), `admin` (authenticated).

**Client:** `src/lib/ws-client.ts` — `useWebSocket()` hook (connect, state, send), `useChannel(channel)` hook (subscribe, messages). Auto-reconnect with exponential backoff.

**Server.ts integration:** Enabled when `SERVER_ROLE` is `all` or `api` and `WS_ENABLED !== 'false'`.

### In-app Notifications

DB-backed notifications with real-time delivery via WebSocket.

**Schema:** `src/server/db/schema/notifications.ts` — `saas_notifications` (userId, orgId, type, category, title, body, actionUrl, read, readAt, expiresAt).

**Service:** `src/server/lib/notifications.ts` — `sendNotification()` (DB insert + WS broadcast, fire-and-forget), `sendOrgNotification()`, `sendBulkNotification()`.

**Router:** `src/server/routers/notifications.ts` — `protectedProcedure` (own only): list (paginated), unreadCount, markRead, markAllRead, delete.

**Components:** `NotificationBell` (admin header, polls every 30s, dropdown with mark-read), notifications page at `/dashboard/notifications`.

### Customer Auth & Account Pages

**Login/Register:** `/login`, `/register` — email/password + social (Google, Discord). Gated by `NEXT_PUBLIC_REGISTRATION_ENABLED`.

**Password reset:** `/forgot-password` (server action → Better Auth), `/reset-password?token=...` (client-side via authClient).

**User menu:** `UserMenu` component in public header — avatar dropdown with account links + sign out.

**Account pages** (`/account/*`): Auth-guarded layout with sidebar. Overview, Settings (profile, GDPR), Security (change password, active sessions, revoke), Billing (current plan, Stripe portal).

**Auth router extensions:** `src/server/routers/auth.ts` — `updateProfile`, `changePassword`, `deleteAccount`, `activeSessions`, `revokeSession`, `revokeAllSessions`.

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
