# SweetCMS Engine Separation & Dashboard Styling Overhaul

**Date:** 2026-03-30
**Scope:** Reusable engine architecture + Linear-inspired dashboard theming

## Context

SweetCMS is a personal starter skeleton CMS (T3 Stack) that gets cloned per project and open-sourced on GitHub. Two problems:

1. No clear boundary between reusable "engine" code and project-specific code — cloning and customizing requires knowing which files to touch
2. Dashboard dark theme is flat/ugly (pure grays, no depth) — light theme is passable but dated

## Decisions

- **Reuse model:** Template repo (clone & customize). No npm package, no monorepo. Polish once, clone per project, occasional cherry-pick back.
- **Style direction:** Linear/Vercel-inspired. OKLCH tinted neutrals, single brand hue controls everything. Not glassmorphism (too opinionated), not pure Tailwind utilities (harder to theme).
- **Brand default:** Indigo/violet (`--brand-hue: 255`)
- **Theme config:** Single `tokens.css` with ~15 CSS variables. Change `--brand-hue` to rebrand.
- **Code boundary:** Physical `src/engine/` folder. Engine imports nothing from project. Project imports from engine.

## Part 1: Engine Folder Structure

### New `src/engine/` layout

```
src/engine/
├── config/
│   ├── content-types.ts    — ContentTypeDeclaration interface + lookup helpers
│   ├── taxonomies.ts       — TaxonomyDeclaration interface + lookup helpers
│   └── index.ts
├── crud/
│   ├── admin-crud.ts       — buildAdminList, buildStatusCounts, ensureSlugUnique, parsePagination, paginatedResult, softDelete/Restore/permanentDelete
│   ├── cms-helpers.ts      — updateWithRevision
│   ├── taxonomy-helpers.ts — syncTermRelationships, getTermRelationships, deleteAllTermRelationships, deleteTermRelationshipsByTerm
│   ├── content-revisions.ts — createRevision, getRevisions, pickSnapshot
│   ├── slug-redirects.ts   — resolveSlugRedirect
│   └── index.ts
├── hooks/
│   ├── useCmsFormState.ts
│   ├── useCmsAutosave.ts
│   ├── useListViewState.ts
│   ├── useBulkSelection.ts
│   ├── useBulkActions.ts
│   ├── useColumnVisibility.ts
│   ├── useKeyboardShortcuts.ts
│   └── index.ts
├── policy/
│   ├── roles.ts            — Role consts, Capability type, AdminSection type
│   ├── policy.ts           — Policy class, ROLE_CAPABILITIES matrix, isSuperAdmin
│   └── index.ts
├── components/
│   ├── CmsFormShell.tsx
│   ├── RichTextEditor.tsx
│   ├── SEOFields.tsx
│   ├── TagInput.tsx
│   ├── MediaPickerDialog.tsx
│   ├── CustomFieldsEditor.tsx
│   ├── RevisionHistory.tsx
│   ├── BulkActionBar.tsx
│   └── index.ts
├── lib/
│   ├── slug.ts             — slugify, slugifyFilename
│   ├── markdown.ts         — htmlToMarkdown, markdownToHtml
│   ├── audit.ts            — logAudit
│   ├── webhooks.ts         — dispatchWebhook
│   └── index.ts
├── types/
│   ├── cms.ts              — PostType, ContentStatus, FileType, ContentSnapshot
│   └── index.ts
└── styles/
    ├── tokens.css           — OKLCH design tokens (the ONE file to customize)
    ├── admin.css            — admin component classes
    └── admin-table.css      — table/form classes
```

### Project-specific (stays in place)

```
src/config/cms.ts            — content type declarations (data array)
src/config/taxonomies.ts     — taxonomy declarations (data array)
src/config/site.ts           — site name, URL, etc.
src/server/db/schema/        — database tables
src/server/routers/          — tRPC routers (import from engine/crud)
src/components/admin/        — PostForm, CategoryForm, etc.
src/components/public/       — public rendering components
src/app/                     — routes, pages, layouts
src/lib/auth.ts, env.ts      — project-specific config
```

### Import rule

Engine imports nothing from project. Project imports from engine. One-way dependency.

Path alias: `@/core/*` → `src/engine/*`

### Config interface split

Currently `src/config/cms.ts` has both the `ContentTypeDeclaration` interface AND the `CONTENT_TYPES` data array.

Split:
- Interface + helpers → `src/engine/config/content-types.ts`
- Data array → `src/config/cms.ts` (imports interface from engine)

Same pattern for taxonomies.

## Part 2: Dashboard Styling System

### Token architecture (`src/engine/styles/tokens.css`)

Single `--brand-hue` CSS variable controls the entire dashboard. OKLCH color space for perceptually uniform tinted neutrals.

```css
:root {
  /* === CUSTOMIZATION POINT === */
  --brand-hue: 255;
  --brand-chroma: 0.15;

  /* === Auto-derived brand scale === */
  --brand-50:  oklch(0.97 0.02 var(--brand-hue));
  --brand-100: oklch(0.93 0.04 var(--brand-hue));
  --brand-500: oklch(0.55 var(--brand-chroma) var(--brand-hue));
  --brand-600: oklch(0.48 var(--brand-chroma) var(--brand-hue));
  --brand-700: oklch(0.40 var(--brand-chroma) var(--brand-hue));

  /* === Tinted neutrals — every gray carries brand hue at low chroma === */
  --gray-50:  oklch(0.98 0.005 var(--brand-hue));
  --gray-100: oklch(0.96 0.005 var(--brand-hue));
  --gray-200: oklch(0.90 0.008 var(--brand-hue));
  --gray-300: oklch(0.83 0.008 var(--brand-hue));
  --gray-400: oklch(0.65 0.01  var(--brand-hue));
  --gray-500: oklch(0.55 0.01  var(--brand-hue));
  --gray-600: oklch(0.45 0.01  var(--brand-hue));
  --gray-700: oklch(0.35 0.012 var(--brand-hue));
  --gray-800: oklch(0.25 0.015 var(--brand-hue));
  --gray-900: oklch(0.18 0.015 var(--brand-hue));
  --gray-950: oklch(0.13 0.02  var(--brand-hue));

  /* === Light mode surfaces === */
  --surface-primary:   var(--gray-50);
  --surface-secondary: white;
  --surface-elevated:  white;
  --surface-inset:     var(--gray-100);

  /* === Text === */
  --text-primary:   var(--gray-900);
  --text-secondary: var(--gray-600);
  --text-muted:     var(--gray-400);
  --text-inverse:   white;

  /* === Borders & shadows === */
  --border-primary:   var(--gray-200);
  --border-secondary: var(--gray-100);
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.04);
  --shadow-md: 0 2px 8px oklch(0 0 0 / 0.06);
  --shadow-lg: 0 8px 24px oklch(0 0 0 / 0.08);

  /* === Semantic (fixed, not brand-derived) === */
  --success: oklch(0.55 0.15 145);
  --warning: oklch(0.55 0.15 70);
  --danger:  oklch(0.55 0.15 25);

  /* === Spacing, radius, motion === */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --duration-fast: 150ms;
  --duration-normal: 200ms;
}

/* === Dark mode === */
html.dark {
  --surface-primary:   var(--gray-950);
  --surface-secondary: var(--gray-900);
  --surface-elevated:  var(--gray-800);
  --surface-inset:     var(--gray-900);

  --text-primary:   var(--gray-50);
  --text-secondary: var(--gray-400);
  --text-muted:     var(--gray-500);

  --border-primary:   var(--gray-800);
  --border-secondary: var(--gray-900);

  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.2);
  --shadow-md: 0 2px 8px oklch(0 0 0 / 0.3);
  --shadow-lg: 0 8px 24px oklch(0 0 0 / 0.4);
}
```

### Why this fixes the dark theme

- Current: pure gray-900/gray-950, lifeless, no depth
- New: every gray has 0.01-0.02 chroma at brand hue. Subtle indigo warmth instead of flat black
- Three surface elevation levels create visual hierarchy without glassmorphism
- Brand accent pops naturally against tinted surfaces

### Admin CSS rebuild

Same class names (`.admin-card`, `.admin-btn-primary`, `.admin-thead`, etc.) rebuilt on new tokens. Key changes:

| Aspect | Current | New |
|---|---|---|
| Grays | Pure hex | OKLCH tinted with brand hue |
| Elevation | Heavy shadows or none | 3-tier surfaces + 1px borders + subtle shadows |
| Table headers | UPPERCASE, bold | Sentence case, 500 weight |
| Badges | Solid color backgrounds | Semi-transparent `oklch(... / 0.1)` with border |
| Hover states | Color change only | Background shift + shadow transition |
| Active/press | None | `scale(0.98)` micro-interaction |
| Focus | Generic outline | Brand-colored 2px outline with offset |
| Spacing | Tight | More generous padding |
| Sidebar active | Brand background | Semi-transparent brand tint + 500 weight |

### Rebranding a cloned project

Change two values in `tokens.css`:
```css
:root {
  --brand-hue: 210;      /* blue */
  --brand-chroma: 0.18;  /* slightly more saturated */
}
```

Everything adapts: surfaces, borders, shadows, buttons, badges, sidebar, focus rings.

## Part 3: File Moves

| Current path | New path |
|---|---|
| `src/lib/policy.ts` | `src/engine/policy/policy.ts` |
| `src/server/utils/admin-crud.ts` | `src/engine/crud/admin-crud.ts` |
| `src/server/utils/taxonomy-helpers.ts` | `src/engine/crud/taxonomy-helpers.ts` |
| `src/server/utils/cms-helpers.ts` | `src/engine/crud/cms-helpers.ts` |
| `src/server/utils/content-revisions.ts` | `src/engine/crud/content-revisions.ts` |
| `src/server/utils/slug-redirects.ts` | `src/engine/crud/slug-redirects.ts` |
| `src/server/utils/audit.ts` | `src/engine/lib/audit.ts` |
| `src/server/utils/webhooks.ts` | `src/engine/lib/webhooks.ts` |
| `src/lib/slug.ts` | `src/engine/lib/slug.ts` |
| `src/lib/markdown.ts` | `src/engine/lib/markdown.ts` |
| `src/types/cms.ts` | `src/engine/types/cms.ts` |
| `src/components/admin/CmsFormShell.tsx` | `src/engine/components/CmsFormShell.tsx` |
| `src/components/admin/RichTextEditor.tsx` | `src/engine/components/RichTextEditor.tsx` |
| `src/components/admin/SEOFields.tsx` | `src/engine/components/SEOFields.tsx` |
| `src/components/admin/TagInput.tsx` | `src/engine/components/TagInput.tsx` |
| `src/components/admin/MediaPickerDialog.tsx` | `src/engine/components/MediaPickerDialog.tsx` |
| `src/components/admin/CustomFieldsEditor.tsx` | `src/engine/components/CustomFieldsEditor.tsx` |
| `src/components/admin/RevisionHistory.tsx` | `src/engine/components/RevisionHistory.tsx` |
| `src/components/admin/BulkActionBar.tsx` | `src/engine/components/BulkActionBar.tsx` |
| `src/hooks/useCmsFormState.ts` | `src/engine/hooks/useCmsFormState.ts` |
| `src/hooks/useCmsAutosave.ts` | `src/engine/hooks/useCmsAutosave.ts` |
| `src/hooks/useListViewState.tsx` | `src/engine/hooks/useListViewState.tsx` |
| `src/hooks/useBulkSelection.ts` | `src/engine/hooks/useBulkSelection.ts` |
| `src/hooks/useBulkActions.ts` | `src/engine/hooks/useBulkActions.ts` |
| `src/hooks/useColumnVisibility.ts` | `src/engine/hooks/useColumnVisibility.ts` |
| `src/hooks/useKeyboardShortcuts.ts` | `src/engine/hooks/useKeyboardShortcuts.ts` |
| `src/app/assets/tokens.css` | `src/engine/styles/tokens.css` (rewritten) |
| `src/app/dashboard/assets/admin.css` | `src/engine/styles/admin.css` (rebuilt) |
| `src/app/assets/admin-table.css` | `src/engine/styles/admin-table.css` (rebuilt) |

## Part 4: Implementation Order

1. Create `src/engine/` folder structure + barrel index files
2. Move files (pure moves, no code changes) + update all imports
3. Split config interfaces from data (cms.ts, taxonomies.ts)
4. Move hooks from `src/hooks/` to `src/engine/hooks/`
5. Verify compilation — `bun run typecheck`
6. Rewrite `tokens.css` with OKLCH tinted neutral system
7. Rebuild `admin.css` on new tokens (same class names)
8. Rebuild `admin-table.css` on new tokens (same class names)
9. Update `globals.css` imports to point to engine styles
10. Visual QA — check light + dark mode across all admin pages
11. Update CLAUDE.md with new engine architecture docs
12. Update tsconfig for `@/engine` path alias

## Resolved Questions

- **Style imports:** Dashboard layout imports engine styles (not globals.css) — public pages don't load admin CSS
- **Font:** System font stack (no bundled font). Zero load time, appropriate for a starter template
- **CmsListView:** Defer genericization. Works as-is, would be a separate project

## Unresolved Questions

None — all questions resolved during brainstorming.
