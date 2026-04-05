# Engine Separation & Dashboard Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract reusable CMS engine into `src/engine/`, rewrite dashboard styles with OKLCH tinted-neutral system.

**Architecture:** Physical `src/engine/` folder contains config interfaces, types, policy, CRUD utils, hooks, components, and styles. Project-specific code stays in `src/config/`, `src/server/`, `src/app/`, `src/components/admin/` (forms). Engine accepts cross-boundary imports from stable infrastructure (`@/server/db`, `@/lib/trpc/client`, `@/lib/translations`, `@/lib/utils`, `@/store/toast-store`).

**Tech Stack:** Next.js 16, Tailwind CSS v4 (CSS-first), OKLCH color space, existing admin CSS class system.

**Spec:** `docs/superpowers/specs/2026-03-30-engine-separation-and-styling-design.md`

---

### Task 1: Create engine folder structure

**Files:**
- Create: `src/engine/config/index.ts`
- Create: `src/engine/crud/index.ts`
- Create: `src/engine/hooks/index.ts`
- Create: `src/engine/policy/index.ts`
- Create: `src/engine/components/index.ts`
- Create: `src/engine/lib/index.ts`
- Create: `src/engine/types/index.ts`
- Create: `src/engine/styles/` (directory only — CSS files created in later tasks)

- [ ] **Step 1: Create all engine directories and empty barrel files**

```bash
mkdir -p src/engine/{config,crud,hooks,policy,components,lib,types,styles}
touch src/engine/config/index.ts
touch src/engine/crud/index.ts
touch src/engine/hooks/index.ts
touch src/engine/policy/index.ts
touch src/engine/components/index.ts
touch src/engine/lib/index.ts
touch src/engine/types/index.ts
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/
git commit -m "chore: create engine folder structure"
```

---

### Task 2: Move type and policy files

**Files:**
- Move: `src/types/cms.ts` → `src/engine/types/cms.ts`
- Move: `src/lib/policy.ts` → `src/engine/policy/policy.ts`

These files have ZERO project imports — cleanest to move first.

- [ ] **Step 1: Move files**

```bash
mv src/types/cms.ts src/engine/types/cms.ts
mv src/lib/policy.ts src/engine/policy/policy.ts
```

- [ ] **Step 2: Write barrel files**

`src/engine/types/index.ts`:
```typescript
export { PostType, ContentStatus, FileType } from './cms';
export type { PostTypeValue, ContentStatusValue, FileTypeValue, ContentSnapshot } from './cms';
```

`src/engine/policy/index.ts`:
```typescript
export { Role, Policy, isSuperAdmin, ROLES } from './policy';
export type { UserRole, AdminSection, Capability } from './policy';
```

- [ ] **Step 3: Update all consumers of `@/types/cms`**

Replace `@/types/cms` → `@/core/types/cms` in these files:
- `src/app/(public)/blog/page.tsx`
- `src/app/(public)/layout.tsx`
- `src/app/(public)/page.tsx`
- `src/app/(public)/search/page.tsx`
- `src/app/(public)/[...slug]/page.tsx`
- `src/app/api/feed/blog/route.ts`
- `src/app/api/feed/tag/[slug]/route.ts`
- `src/app/api/v1/categories/route.ts`
- `src/app/api/v1/categories/[slug]/route.ts`
- `src/app/api/v1/posts/route.ts`
- `src/app/api/v1/posts/[slug]/route.ts`
- `src/app/api/v1/tags/route.ts`
- `src/app/dashboard/media/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/settings/import/page.tsx`
- `src/app/sitemap.ts`
- `src/components/admin/BulkActionBar.tsx`
- `src/components/admin/CategoryForm.tsx`
- `src/components/admin/CmsListView.tsx`
- `src/components/admin/ContentCalendar.tsx`
- `src/components/admin/MediaPickerDialog.tsx`
- `src/components/admin/PostForm.tsx`
- `src/components/admin/PortfolioForm.tsx`
- `src/server/routers/cms.ts`
- `src/server/routers/categories.ts`
- `src/server/routers/portfolio.ts`
- `src/server/routers/content-search.ts`
- `src/server/routers/media.ts`
- `src/server/routers/import.ts`
- `src/server/utils/admin-crud.ts` (still at old path for now)
- `src/server/utils/content-revisions.ts` (still at old path for now)

Use find-and-replace across the codebase: `from '@/types/cms'` → `from '@/core/types/cms'`

- [ ] **Step 4: Update all consumers of `@/lib/policy`**

Replace `@/lib/policy` → `@/core/policy` in these files:
- `src/app/api/gdpr-export/[userId]/route.ts`
- `src/app/api/upload/route.ts`
- `src/app/dashboard/users/page.tsx`
- `src/app/dashboard/users/[id]/page.tsx`
- `src/lib/auth.ts`
- `src/server/routers/users.ts`
- `src/server/trpc.ts`
- `src/server/utils/gdpr.ts`

Use find-and-replace: `from '@/lib/policy'` → `from '@/core/policy'`

- [ ] **Step 5: Verify typecheck**

```bash
bun run typecheck
```

Expected: PASS (no type errors)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move types and policy to engine"
```

---

### Task 3: Move lib utilities (slug, markdown)

**Files:**
- Move: `src/lib/slug.ts` → `src/engine/lib/slug.ts`
- Move: `src/lib/markdown.ts` → `src/engine/lib/markdown.ts`

Both have ZERO project imports.

- [ ] **Step 1: Move files**

```bash
mv src/lib/slug.ts src/engine/lib/slug.ts
mv src/lib/markdown.ts src/engine/lib/markdown.ts
```

- [ ] **Step 2: Update barrel file**

`src/engine/lib/index.ts`:
```typescript
export { slugify, slugifyFilename } from './slug';
export { htmlToMarkdown, markdownToHtml } from './markdown';
```

- [ ] **Step 3: Update all consumers of `@/lib/slug`**

Replace `@/lib/slug` → `@/core/lib/slug` in:
- `src/app/api/upload/route.ts`
- `src/app/dashboard/cms/menus/page.tsx`
- `src/components/admin/CategoryForm.tsx`
- `src/components/admin/PortfolioForm.tsx`
- `src/components/admin/PostForm.tsx`
- `src/components/admin/TermForm.tsx`
- `src/server/routers/custom-fields.ts`
- `src/server/routers/forms.ts`
- `src/server/routers/import.ts`
- `src/server/routers/media.ts`
- `src/server/routers/tags.ts`

- [ ] **Step 4: Update all consumers of `@/lib/markdown`**

Replace `@/lib/markdown` → `@/core/lib/markdown` in:
- `src/components/admin/RichTextEditor.tsx`
- `src/components/public/ShortcodeRenderer.tsx`

- [ ] **Step 5: Verify typecheck**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move slug and markdown utils to engine"
```

---

### Task 4: Move CRUD utilities

**Files:**
- Move: `src/server/utils/admin-crud.ts` → `src/engine/crud/admin-crud.ts`
- Move: `src/server/utils/taxonomy-helpers.ts` → `src/engine/crud/taxonomy-helpers.ts`
- Move: `src/server/utils/cms-helpers.ts` → `src/engine/crud/cms-helpers.ts`
- Move: `src/server/utils/content-revisions.ts` → `src/engine/crud/content-revisions.ts`
- Move: `src/server/utils/slug-redirects.ts` → `src/engine/crud/slug-redirects.ts`
- Move: `src/server/utils/audit.ts` → `src/engine/lib/audit.ts`
- Move: `src/server/utils/webhooks.ts` → `src/engine/lib/webhooks.ts`

These import from `@/server/db` and `@/server/db/schema` — accepted cross-boundary imports.

- [ ] **Step 1: Move CRUD files**

```bash
mv src/server/utils/admin-crud.ts src/engine/crud/admin-crud.ts
mv src/server/utils/taxonomy-helpers.ts src/engine/crud/taxonomy-helpers.ts
mv src/server/utils/cms-helpers.ts src/engine/crud/cms-helpers.ts
mv src/server/utils/content-revisions.ts src/engine/crud/content-revisions.ts
mv src/server/utils/slug-redirects.ts src/engine/crud/slug-redirects.ts
mv src/server/utils/audit.ts src/engine/lib/audit.ts
mv src/server/utils/webhooks.ts src/engine/lib/webhooks.ts
```

- [ ] **Step 2: Fix internal cross-reference in cms-helpers.ts**

`cms-helpers.ts` imports from `./content-revisions`. After move, both are in `src/engine/crud/`, so this relative import still works. Verify no change needed.

- [ ] **Step 3: Fix import in admin-crud.ts**

`admin-crud.ts` imports `@/types/cms` → already moved → update to `@/core/types/cms`.

- [ ] **Step 4: Fix import in content-revisions.ts**

`content-revisions.ts` imports `@/types/cms` → update to `@/core/types/cms`.

- [ ] **Step 5: Update barrel files**

`src/engine/crud/index.ts`:
```typescript
export {
  softDelete, softRestore, permanentDelete,
  buildAdminList, buildStatusCounts, ensureSlugUnique,
  parsePagination, paginatedResult,
} from './admin-crud';
export type { CrudColumns, AdminListInput, AdminListCols, StatusCountCols } from './admin-crud';
export { updateWithRevision, batchGroupLangs, findTranslations } from './cms-helpers';
export type { TranslationCols, UpdateWithRevisionOpts } from './cms-helpers';
export {
  syncTermRelationships, getTermRelationships,
  deleteAllTermRelationships, deleteTermRelationshipsByTerm,
  getObjectIdsForTerm, batchGetTermRelationships, resolveTagsForPosts,
} from './taxonomy-helpers';
export { createRevision, getRevisions, pickSnapshot } from './content-revisions';
export { resolveSlugRedirect } from './slug-redirects';
```

Append to `src/engine/lib/index.ts`:
```typescript
export { logAudit } from './audit';
export type { LogAuditParams } from './audit';
export { dispatchWebhook } from './webhooks';
```

- [ ] **Step 6: Update all consumers of `@/server/utils/admin-crud`**

Replace `@/server/utils/admin-crud` → `@/core/crud/admin-crud` in:
- `src/server/routers/audit.ts`
- `src/server/routers/categories.ts`
- `src/server/routers/cms.ts`
- `src/server/routers/content-search.ts`
- `src/server/routers/forms.ts`
- `src/server/routers/media.ts`
- `src/server/routers/menus.ts`
- `src/server/routers/portfolio.ts`
- `src/server/routers/redirects.ts`
- `src/server/routers/tags.ts`
- `src/server/routers/users.ts`

- [ ] **Step 7: Update all consumers of `@/server/utils/taxonomy-helpers`**

Replace `@/server/utils/taxonomy-helpers` → `@/core/crud/taxonomy-helpers` in:
- `src/server/routers/categories.ts`
- `src/server/routers/cms.ts`
- `src/server/routers/portfolio.ts`
- `src/server/routers/tags.ts`

- [ ] **Step 8: Update all consumers of `@/server/utils/cms-helpers`**

Replace `@/server/utils/cms-helpers` → `@/core/crud/cms-helpers` in:
- `src/server/routers/categories.ts`
- `src/server/routers/cms.ts`
- `src/server/routers/portfolio.ts`

- [ ] **Step 9: Update consumers of content-revisions, slug-redirects, audit, webhooks**

Replace `@/server/utils/content-revisions` → `@/core/crud/content-revisions` in all consumers.
Replace `@/server/utils/slug-redirects` → `@/core/crud/slug-redirects` in all consumers.
Replace `@/server/utils/audit` → `@/core/lib/audit` in all consumers.
Replace `@/server/utils/webhooks` → `@/core/lib/webhooks` in all consumers.

Search for each import path and update all occurrences.

- [ ] **Step 10: Verify typecheck**

```bash
bun run typecheck
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: move CRUD utils and audit/webhooks to engine"
```

---

### Task 5: Move hooks

**Files:**
- Move: `src/hooks/useCmsFormState.ts` → `src/engine/hooks/useCmsFormState.ts`
- Move: `src/hooks/useCmsAutosave.ts` → `src/engine/hooks/useCmsAutosave.ts`
- Move: `src/hooks/useListViewState.tsx` → `src/engine/hooks/useListViewState.tsx`
- Move: `src/hooks/useBulkSelection.ts` → `src/engine/hooks/useBulkSelection.ts`
- Move: `src/hooks/useBulkActions.ts` → `src/engine/hooks/useBulkActions.ts`
- Move: `src/hooks/useColumnVisibility.ts` → `src/engine/hooks/useColumnVisibility.ts`
- Move: `src/hooks/useKeyboardShortcuts.ts` → `src/engine/hooks/useKeyboardShortcuts.ts`
- Move: `src/hooks/useLinkPicker.ts` → `src/engine/hooks/useLinkPicker.ts`
- Move: `src/hooks/useLinkValidation.ts` → `src/engine/hooks/useLinkValidation.ts`

- [ ] **Step 1: Move all hook files**

```bash
mv src/hooks/useCmsFormState.ts src/engine/hooks/useCmsFormState.ts
mv src/hooks/useCmsAutosave.ts src/engine/hooks/useCmsAutosave.ts
mv src/hooks/useListViewState.tsx src/engine/hooks/useListViewState.tsx
mv src/hooks/useBulkSelection.ts src/engine/hooks/useBulkSelection.ts
mv src/hooks/useBulkActions.ts src/engine/hooks/useBulkActions.ts
mv src/hooks/useColumnVisibility.ts src/engine/hooks/useColumnVisibility.ts
mv src/hooks/useKeyboardShortcuts.ts src/engine/hooks/useKeyboardShortcuts.ts
mv src/hooks/useLinkPicker.ts src/engine/hooks/useLinkPicker.ts
mv src/hooks/useLinkValidation.ts src/engine/hooks/useLinkValidation.ts
```

- [ ] **Step 2: Write barrel file**

`src/engine/hooks/index.ts`:
```typescript
export { useCmsFormState } from './useCmsFormState';
export { useCmsAutosave } from './useCmsAutosave';
export { useListViewState, SortIcon } from './useListViewState';
export { useBulkSelection } from './useBulkSelection';
export { useBulkActions } from './useBulkActions';
export { useColumnVisibility } from './useColumnVisibility';
export { useKeyboardShortcuts } from './useKeyboardShortcuts';
export { useLinkPicker } from './useLinkPicker';
export { useLinkValidation } from './useLinkValidation';
```

- [ ] **Step 3: Update all consumers**

Find-and-replace across codebase:
- `from '@/hooks/useCmsFormState'` → `from '@/core/hooks/useCmsFormState'`
- `from '@/hooks/useCmsAutosave'` → `from '@/core/hooks/useCmsAutosave'`
- `from '@/hooks/useListViewState'` → `from '@/core/hooks/useListViewState'`
- `from '@/hooks/useBulkSelection'` → `from '@/core/hooks/useBulkSelection'`
- `from '@/hooks/useBulkActions'` → `from '@/core/hooks/useBulkActions'`
- `from '@/hooks/useColumnVisibility'` → `from '@/core/hooks/useColumnVisibility'`
- `from '@/hooks/useKeyboardShortcuts'` → `from '@/core/hooks/useKeyboardShortcuts'`
- `from '@/hooks/useLinkPicker'` → `from '@/core/hooks/useLinkPicker'`
- `from '@/hooks/useLinkValidation'` → `from '@/core/hooks/useLinkValidation'`

- [ ] **Step 4: Remove old src/hooks/ directory if empty**

```bash
rmdir src/hooks/ 2>/dev/null || true
```

- [ ] **Step 5: Verify typecheck**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move hooks to engine"
```

---

### Task 6: Move components

**Files:**
- Move: `src/components/admin/CmsFormShell.tsx` → `src/engine/components/CmsFormShell.tsx`
- Move: `src/components/admin/RichTextEditor.tsx` → `src/engine/components/RichTextEditor.tsx`
- Move: `src/components/admin/SEOFields.tsx` → `src/engine/components/SEOFields.tsx`
- Move: `src/components/admin/TagInput.tsx` → `src/engine/components/TagInput.tsx`
- Move: `src/components/admin/MediaPickerDialog.tsx` → `src/engine/components/MediaPickerDialog.tsx`
- Move: `src/components/admin/CustomFieldsEditor.tsx` → `src/engine/components/CustomFieldsEditor.tsx`
- Move: `src/components/admin/RevisionHistory.tsx` → `src/engine/components/RevisionHistory.tsx`
- Move: `src/components/admin/BulkActionBar.tsx` → `src/engine/components/BulkActionBar.tsx`

- [ ] **Step 1: Move component files**

```bash
mv src/components/admin/CmsFormShell.tsx src/engine/components/CmsFormShell.tsx
mv src/components/admin/RichTextEditor.tsx src/engine/components/RichTextEditor.tsx
mv src/components/admin/SEOFields.tsx src/engine/components/SEOFields.tsx
mv src/components/admin/TagInput.tsx src/engine/components/TagInput.tsx
mv src/components/admin/MediaPickerDialog.tsx src/engine/components/MediaPickerDialog.tsx
mv src/components/admin/CustomFieldsEditor.tsx src/engine/components/CustomFieldsEditor.tsx
mv src/components/admin/RevisionHistory.tsx src/engine/components/RevisionHistory.tsx
mv src/components/admin/BulkActionBar.tsx src/engine/components/BulkActionBar.tsx
```

- [ ] **Step 2: Fix internal imports in moved components**

RichTextEditor imports `./shortcodes/ShortcodeNode` and `./shortcodes/shortcode-utils` — these stay in `src/components/admin/shortcodes/`. Update to absolute paths:
- `./shortcodes/ShortcodeNode` → `@/components/admin/shortcodes/ShortcodeNode`
- `./shortcodes/shortcode-utils` → `@/components/admin/shortcodes/shortcode-utils`

RichTextEditor imports `@/hooks/useLinkPicker` → already moved → `@/core/hooks/useLinkPicker`

RevisionHistory imports `@/components/ui/ConfirmDialog` — stays as-is (UI component, project-level).

All moved components import `@/types/cms` → already moved → update to `@/core/types/cms`

- [ ] **Step 3: Write barrel file**

`src/engine/components/index.ts`:
```typescript
export { default as CmsFormShell } from './CmsFormShell';
export { RichTextEditor } from './RichTextEditor';
export { SEOFields } from './SEOFields';
export { TagInput } from './TagInput';
export { MediaPickerDialog } from './MediaPickerDialog';
export { CustomFieldsEditor } from './CustomFieldsEditor';
export type { CustomFieldsEditorHandle } from './CustomFieldsEditor';
export { RevisionHistory } from './RevisionHistory';
export { default as BulkActionBar } from './BulkActionBar';
```

- [ ] **Step 4: Update all consumers**

Find-and-replace across codebase. Consumers are primarily the form components (PostForm, CategoryForm, PortfolioForm, TermForm, CmsListView):
- `from '@/components/admin/CmsFormShell'` → `from '@/core/components/CmsFormShell'`
- `from '@/components/admin/RichTextEditor'` → `from '@/core/components/RichTextEditor'`
- `from '@/components/admin/SEOFields'` → `from '@/core/components/SEOFields'`
- `from '@/components/admin/TagInput'` → `from '@/core/components/TagInput'`
- `from '@/components/admin/MediaPickerDialog'` → `from '@/core/components/MediaPickerDialog'`
- `from '@/components/admin/CustomFieldsEditor'` → `from '@/core/components/CustomFieldsEditor'`
- `from '@/components/admin/RevisionHistory'` → `from '@/core/components/RevisionHistory'`
- `from '@/components/admin/BulkActionBar'` → `from '@/core/components/BulkActionBar'`

- [ ] **Step 5: Verify typecheck**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move shared components to engine"
```

---

### Task 7: Split config interfaces from data

**Files:**
- Create: `src/engine/config/content-types.ts` (interfaces + helpers from `src/config/cms.ts`)
- Create: `src/engine/config/taxonomies.ts` (interfaces + helpers from `src/config/taxonomies.ts`)
- Modify: `src/config/cms.ts` (keep only data array, import interfaces from engine)
- Modify: `src/config/taxonomies.ts` (keep only data array, import interfaces from engine)

- [ ] **Step 1: Create `src/engine/config/content-types.ts`**

Extract from `src/config/cms.ts`: the `ContentTypeDeclaration` interface, `PostContentTypeId` type, `AdminSlug` type, and the three lookup functions (`getContentType`, `getContentTypeByPostType`, `getContentTypeByAdminSlug`).

The lookup functions reference the `CONTENT_TYPES` array which stays in project config. To resolve this, the engine provides the interface and a factory that creates helpers from a data array:

```typescript
// src/engine/config/content-types.ts

export interface ContentTypeDeclaration {
  // Copy exact interface from src/config/cms.ts
  id: string;
  urlPrefix: string;
  listSegment?: string;
  listTitle?: string;
  canOverrideCodedRouteSEO?: boolean;
  fallbackToDefault?: boolean;
  label: string;
  labelPlural: string;
  postType?: number;
  adminSlug: string;
  adminCapability: string;
  titleTemplate: string;
  sitemapSlug?: string;
  sidebarLabel?: string;
  postFormFields?: string[];
  listDescription?: string;
}

export function createContentTypeHelpers<T extends readonly ContentTypeDeclaration[]>(types: T) {
  const byId = new Map(types.map(t => [t.id, t]));
  const byPostType = new Map(types.filter(t => t.postType != null).map(t => [t.postType!, t]));
  const byAdminSlug = new Map(types.map(t => [t.adminSlug, t]));

  return {
    getContentType(id: string): ContentTypeDeclaration {
      const ct = byId.get(id);
      if (!ct) throw new Error(`Unknown content type: ${id}`);
      return ct;
    },
    getContentTypeByPostType(postType: number): ContentTypeDeclaration {
      const ct = byPostType.get(postType);
      if (!ct) throw new Error(`Unknown post type: ${postType}`);
      return ct;
    },
    getContentTypeByAdminSlug(slug: string): ContentTypeDeclaration | undefined {
      return byAdminSlug.get(slug);
    },
  };
}
```

- [ ] **Step 2: Create `src/engine/config/taxonomies.ts`**

```typescript
// src/engine/config/taxonomies.ts

export interface TaxonomyDeclaration {
  // Copy exact interface from src/config/taxonomies.ts
  id: string;
  label: string;
  labelPlural: string;
  urlPrefix: string;
  adminSlug: string;
  customTable: boolean;
  contentTypes: string[];
  inputType: string;
  hasDetailPage: boolean;
  sitemapSlug?: string;
}

export function createTaxonomyHelpers<T extends readonly TaxonomyDeclaration[]>(taxonomies: T) {
  const byId = new Map(taxonomies.map(t => [t.id, t]));
  const byAdminSlug = new Map(taxonomies.map(t => [t.adminSlug, t]));

  return {
    getTaxonomy(id: string): TaxonomyDeclaration {
      const t = byId.get(id);
      if (!t) throw new Error(`Unknown taxonomy: ${id}`);
      return t;
    },
    getTaxonomyByAdminSlug(slug: string): TaxonomyDeclaration | undefined {
      return byAdminSlug.get(slug);
    },
    getTaxonomiesForContentType(contentTypeId: string): TaxonomyDeclaration[] {
      return taxonomies.filter(t => t.contentTypes.includes(contentTypeId));
    },
  };
}
```

- [ ] **Step 3: Update engine config barrel**

`src/engine/config/index.ts`:
```typescript
export type { ContentTypeDeclaration } from './content-types';
export { createContentTypeHelpers } from './content-types';
export type { TaxonomyDeclaration } from './taxonomies';
export { createTaxonomyHelpers } from './taxonomies';
```

- [ ] **Step 4: Refactor `src/config/cms.ts`**

Remove the interface and standalone functions. Import interface from engine. Use factory:

```typescript
import type { ContentTypeDeclaration } from '@/core/config/content-types';
import { createContentTypeHelpers } from '@/core/config/content-types';

export const CONTENT_TYPES = [
  // ... existing array, unchanged
] as const satisfies readonly ContentTypeDeclaration[];

// Derive types from data
export type PostContentTypeId = /* keep existing derivation */;
export type AdminSlug = /* keep existing derivation */;

// Create helpers from data
const helpers = createContentTypeHelpers(CONTENT_TYPES);
export const getContentType = helpers.getContentType;
export const getContentTypeByPostType = helpers.getContentTypeByPostType;
export const getContentTypeByAdminSlug = helpers.getContentTypeByAdminSlug;
```

- [ ] **Step 5: Refactor `src/config/taxonomies.ts`**

Same pattern — import interface from engine, use factory:

```typescript
import type { TaxonomyDeclaration } from '@/core/config/taxonomies';
import { createTaxonomyHelpers } from '@/core/config/taxonomies';

export const TAXONOMIES = [
  // ... existing array, unchanged
] as const satisfies readonly TaxonomyDeclaration[];

const helpers = createTaxonomyHelpers(TAXONOMIES);
export const getTaxonomy = helpers.getTaxonomy;
export const getTaxonomyByAdminSlug = helpers.getTaxonomyByAdminSlug;
export const getTaxonomiesForContentType = helpers.getTaxonomiesForContentType;
```

- [ ] **Step 6: Verify typecheck**

```bash
bun run typecheck
```

Consumers of `@/config/cms` and `@/config/taxonomies` should continue working — same export names.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: split config interfaces into engine, data stays project-level"
```

---

### Task 8: Rewrite tokens.css with OKLCH tinted-neutral system

**Files:**
- Create: `src/engine/styles/tokens.css` (full rewrite)

- [ ] **Step 1: Write new tokens.css**

`src/engine/styles/tokens.css`:

```css
@layer theme, base, components, utilities;

/*
 * SweetCMS Design Tokens — OKLCH Tinted-Neutral System
 *
 * To rebrand: change --brand-hue and --brand-chroma.
 * All surfaces, borders, shadows, and accents adapt automatically.
 *
 * Default: Indigo (hue 270)
 * Examples: Blue=220, Emerald=155, Rose=10, Orange=55
 */

@theme {
  /* Brand accent scale */
  --color-brand-50:  oklch(0.97 0.02 270);
  --color-brand-100: oklch(0.93 0.04 270);
  --color-brand-200: oklch(0.87 0.07 270);
  --color-brand-300: oklch(0.76 0.10 270);
  --color-brand-400: oklch(0.65 0.14 270);
  --color-brand-500: oklch(0.55 0.17 270);
  --color-brand-600: oklch(0.48 0.17 270);
  --color-brand-700: oklch(0.40 0.15 270);
  --color-brand-800: oklch(0.33 0.12 270);
  --color-brand-900: oklch(0.27 0.10 270);

  /* Tinted gray scale — carries subtle brand hue */
  --color-gray-50:  oklch(0.985 0.004 270);
  --color-gray-100: oklch(0.96 0.005 270);
  --color-gray-200: oklch(0.90 0.008 270);
  --color-gray-300: oklch(0.83 0.008 270);
  --color-gray-400: oklch(0.65 0.01  270);
  --color-gray-500: oklch(0.55 0.01  270);
  --color-gray-600: oklch(0.45 0.01  270);
  --color-gray-700: oklch(0.37 0.012 270);
  --color-gray-800: oklch(0.27 0.015 270);
  --color-gray-900: oklch(0.20 0.015 270);
  --color-gray-950: oklch(0.14 0.02  270);

  /* Semantic colors (fixed, not brand-derived) */
  --color-success-50:  oklch(0.96 0.03 150);
  --color-success-500: oklch(0.60 0.16 150);
  --color-success-600: oklch(0.53 0.15 150);
  --color-success-700: oklch(0.46 0.13 150);

  --color-warning-50:  oklch(0.97 0.03 80);
  --color-warning-500: oklch(0.75 0.16 65);
  --color-warning-600: oklch(0.65 0.16 55);

  --color-danger-50:  oklch(0.97 0.02 25);
  --color-danger-500: oklch(0.60 0.19 25);
  --color-danger-600: oklch(0.55 0.19 25);
  --color-danger-700: oklch(0.48 0.17 25);

  --color-white: #ffffff;
  --color-black: #000000;
}

:root {
  /* Surfaces */
  --surface-primary:   var(--color-gray-50);
  --surface-secondary: var(--color-white);
  --surface-elevated:  var(--color-white);
  --surface-inset:     var(--color-gray-100);
  --surface-overlay:   oklch(0 0 0 / 0.5);

  /* Text */
  --text-primary:   var(--color-gray-900);
  --text-secondary: var(--color-gray-600);
  --text-muted:     var(--color-gray-400);
  --text-inverse:   var(--color-white);

  /* Borders */
  --border-primary:   var(--color-gray-200);
  --border-secondary: var(--color-gray-100);

  /* Shadows — light mode: subtle, warm */
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.04);
  --shadow-md: 0 2px 8px oklch(0 0 0 / 0.06), 0 1px 2px oklch(0 0 0 / 0.04);
  --shadow-lg: 0 8px 24px oklch(0 0 0 / 0.08), 0 2px 8px oklch(0 0 0 / 0.04);

  /* Border radius */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.625rem;
  --radius-xl: 0.75rem;

  /* Motion */
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
}

html.dark {
  color-scheme: dark;

  /* Surfaces — tinted dark with brand undertone */
  --surface-primary:   var(--color-gray-950);
  --surface-secondary: var(--color-gray-900);
  --surface-elevated:  var(--color-gray-800);
  --surface-inset:     oklch(0.17 0.018 270);
  --surface-overlay:   oklch(0 0 0 / 0.7);

  /* Text */
  --text-primary:   var(--color-gray-50);
  --text-secondary: var(--color-gray-400);
  --text-muted:     var(--color-gray-500);
  --text-inverse:   var(--color-gray-900);

  /* Borders */
  --border-primary:   var(--color-gray-800);
  --border-secondary: oklch(0.17 0.015 270);

  /* Shadows — dark mode: deeper, brand-tinted */
  --shadow-sm: 0 1px 3px oklch(0 0 0 / 0.25);
  --shadow-md: 0 3px 10px oklch(0 0 0 / 0.35), 0 1px 3px oklch(0 0 0 / 0.2);
  --shadow-lg: 0 8px 30px oklch(0 0 0 / 0.45), 0 3px 10px oklch(0 0 0 / 0.25);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/styles/tokens.css
git commit -m "feat: rewrite design tokens with OKLCH tinted-neutral system"
```

---

### Task 9: Rebuild admin.css on new tokens

**Files:**
- Create: `src/engine/styles/admin.css`

- [ ] **Step 1: Write new admin.css**

`src/engine/styles/admin.css`:

```css
@layer theme, base, components, utilities;

@import "./admin-table.css";

/*
 * SweetCMS Admin Panel — Component Classes
 * Linear-inspired design: tinted neutrals, subtle elevation, clean typography.
 * All classes use design tokens from tokens.css.
 */

@layer components {
  /* ===================== Cards ===================== */
  .admin-card {
    background-color: var(--surface-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    transition: box-shadow var(--duration-fast) ease;
  }

  /* ===================== Typography ===================== */
  .admin-h2 {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.01em;
  }

  /* ===================== Tables ===================== */
  .admin-thead {
    background-color: var(--surface-inset);
    border-bottom: 1px solid var(--border-primary);
  }

  .admin-th {
    padding: 0.625rem 1rem;
    text-align: left;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    letter-spacing: 0.01em;
  }

  .admin-td {
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    color: var(--text-primary);
    border-bottom: 1px solid var(--border-secondary);
  }

  /* ===================== Sidebar ===================== */
  .admin-sidebar-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 400;
    color: var(--text-secondary);
    transition: color var(--duration-fast) ease, background-color var(--duration-fast) ease;
  }

  .admin-sidebar-link:hover {
    color: var(--text-primary);
    background-color: var(--surface-inset);
  }

  .admin-sidebar-link.active {
    color: var(--color-brand-600);
    background-color: oklch(from var(--color-brand-500) l c h / 0.08);
    font-weight: 500;
  }

  /* ===================== Buttons ===================== */
  .admin-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.25;
    cursor: pointer;
    transition: background-color var(--duration-fast) ease,
                color var(--duration-fast) ease,
                border-color var(--duration-fast) ease,
                box-shadow var(--duration-fast) ease,
                transform var(--duration-fast) ease;
    user-select: none;
  }

  .admin-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  .admin-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .admin-btn:focus-visible {
    outline: 2px solid var(--color-brand-500);
    outline-offset: 2px;
  }

  .admin-btn-primary {
    background-color: var(--color-brand-600);
    color: var(--color-white);
  }

  .admin-btn-primary:hover:not(:disabled) {
    background-color: var(--color-brand-700);
  }

  .admin-btn-secondary {
    background-color: var(--surface-secondary);
    color: var(--text-primary);
    border-color: var(--border-primary);
  }

  .admin-btn-secondary:hover:not(:disabled) {
    background-color: var(--surface-inset);
  }

  .admin-btn-danger {
    background-color: var(--color-danger-600);
    color: var(--color-white);
  }

  .admin-btn-danger:hover:not(:disabled) {
    background-color: var(--color-danger-700);
  }

  .admin-btn-success {
    background-color: var(--color-success-600);
    color: var(--color-white);
  }

  .admin-btn-success:hover:not(:disabled) {
    background-color: var(--color-success-700);
  }

  .admin-btn-sm {
    padding: 0.25rem 0.625rem;
    font-size: 0.8125rem;
    gap: 0.25rem;
  }
}

/* ===================== Dark mode overrides ===================== */
html.dark {
  .admin-sidebar-link.active {
    color: var(--color-brand-400);
    background-color: oklch(from var(--color-brand-500) l c h / 0.12);
  }

  .admin-btn-secondary {
    background-color: var(--surface-secondary);
    border-color: var(--border-primary);
  }

  .admin-btn-secondary:hover:not(:disabled) {
    background-color: var(--surface-elevated);
    border-color: var(--color-gray-700);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/styles/admin.css
git commit -m "feat: rebuild admin.css with Linear-inspired styling"
```

---

### Task 10: Rebuild admin-table.css on new tokens

**Files:**
- Create: `src/engine/styles/admin-table.css`

- [ ] **Step 1: Write new admin-table.css**

`src/engine/styles/admin-table.css`:

```css
@layer theme, base, components, utilities;

/*
 * SweetCMS Admin — Table, Badge, Form, and Pagination Classes
 * Built on OKLCH tinted-neutral tokens.
 */

@layer components {
  /* ===================== Table Rows ===================== */
  .admin-tr {
    transition: background-color var(--duration-fast) ease;
  }

  .admin-tr:hover {
    background-color: var(--surface-inset);
  }

  /* ===================== Action Buttons ===================== */
  .admin-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    color: var(--text-secondary);
    transition: color var(--duration-fast) ease, background-color var(--duration-fast) ease;
    cursor: pointer;
  }

  .admin-action-btn:hover {
    color: var(--text-primary);
    background-color: var(--surface-inset);
  }

  .admin-action-btn-danger {
    color: var(--color-danger-600);
  }

  .admin-action-btn-danger:hover {
    color: var(--color-danger-700);
    background-color: var(--color-danger-50);
  }

  /* ===================== Status Badges ===================== */
  .admin-badge {
    display: inline-flex;
    align-items: center;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    border: 1px solid transparent;
    line-height: 1.5;
  }

  .admin-badge-published {
    background-color: oklch(from var(--color-success-500) l c h / 0.1);
    color: var(--color-success-600);
    border-color: oklch(from var(--color-success-500) l c h / 0.2);
  }

  .admin-badge-draft {
    background-color: var(--surface-inset);
    color: var(--text-secondary);
    border-color: var(--border-primary);
  }

  .admin-badge-scheduled {
    background-color: oklch(from var(--color-brand-500) l c h / 0.1);
    color: var(--color-brand-600);
    border-color: oklch(from var(--color-brand-500) l c h / 0.2);
  }

  .admin-badge-trashed {
    background-color: oklch(from var(--color-danger-500) l c h / 0.1);
    color: var(--color-danger-600);
    border-color: oklch(from var(--color-danger-500) l c h / 0.2);
  }

  /* ===================== Search & Filters ===================== */
  .admin-search-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background-color: var(--surface-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    color: var(--text-primary);
    transition: border-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
  }

  .admin-search-input::placeholder {
    color: var(--text-muted);
  }

  .admin-search-input:focus {
    outline: none;
    border-color: var(--color-brand-500);
    box-shadow: 0 0 0 3px oklch(from var(--color-brand-500) l c h / 0.15);
  }

  .admin-filter-select {
    padding: 0.5rem 2rem 0.5rem 0.75rem;
    background-color: var(--surface-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    color: var(--text-primary);
    cursor: pointer;
    transition: border-color var(--duration-fast) ease;
  }

  .admin-filter-select:focus {
    outline: none;
    border-color: var(--color-brand-500);
    box-shadow: 0 0 0 3px oklch(from var(--color-brand-500) l c h / 0.15);
  }

  /* ===================== Empty State ===================== */
  .admin-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1.5rem;
    text-align: center;
  }

  .admin-empty-state-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    margin-bottom: 1rem;
    border-radius: var(--radius-lg);
    background-color: var(--surface-inset);
    color: var(--text-muted);
  }

  .admin-empty-state-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .admin-empty-state-text {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  /* ===================== Sortable Headers ===================== */
  .admin-sortable-th {
    cursor: pointer;
    user-select: none;
    transition: color var(--duration-fast) ease;
  }

  .admin-sortable-th:hover {
    color: var(--text-primary);
  }

  /* ===================== Pagination ===================== */
  .admin-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--border-secondary);
  }

  .admin-pagination-info {
    font-size: 0.8125rem;
    color: var(--text-muted);
  }

  .admin-pagination-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    font-size: 0.8125rem;
    color: var(--text-secondary);
    background-color: var(--surface-secondary);
    cursor: pointer;
    transition: background-color var(--duration-fast) ease,
                color var(--duration-fast) ease,
                border-color var(--duration-fast) ease;
  }

  .admin-pagination-btn:hover:not(:disabled) {
    background-color: var(--surface-inset);
    color: var(--text-primary);
  }

  .admin-pagination-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .admin-pagination-btn.active {
    background-color: var(--color-brand-600);
    border-color: var(--color-brand-600);
    color: var(--color-white);
  }

  /* ===================== Status Tabs ===================== */
  .admin-status-tabs {
    display: flex;
    gap: 0.125rem;
    border-bottom: 1px solid var(--border-primary);
    padding: 0 0.5rem;
  }

  .admin-status-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
    transition: color var(--duration-fast) ease, border-color var(--duration-fast) ease;
  }

  .admin-status-tab:hover {
    color: var(--text-secondary);
  }

  .admin-status-tab.active {
    color: var(--color-brand-600);
    border-bottom-color: var(--color-brand-600);
  }

  .admin-status-tab-count {
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0 0.375rem;
    border-radius: 9999px;
    background-color: var(--surface-inset);
    color: var(--text-muted);
    line-height: 1.5;
  }

  .admin-status-tab.active .admin-status-tab-count {
    background-color: oklch(from var(--color-brand-500) l c h / 0.1);
    color: var(--color-brand-600);
  }

  /* ===================== Form Inputs ===================== */
  .admin-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background-color: var(--surface-secondary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    color: var(--text-primary);
    transition: border-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
  }

  .admin-input:focus {
    outline: none;
    border-color: var(--color-brand-500);
    box-shadow: 0 0 0 3px oklch(from var(--color-brand-500) l c h / 0.15);
  }

  .admin-input::placeholder {
    color: var(--text-muted);
  }

  .admin-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 0.375rem;
  }

  /* ===================== Role Badges ===================== */
  .admin-role-badge {
    display: inline-flex;
    align-items: center;
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    border: 1px solid transparent;
  }

  .admin-role-superadmin {
    background-color: oklch(0.95 0.04 310);
    color: oklch(0.50 0.18 310);
    border-color: oklch(0.85 0.06 310);
  }

  .admin-role-admin {
    background-color: oklch(from var(--color-brand-500) l c h / 0.1);
    color: var(--color-brand-600);
    border-color: oklch(from var(--color-brand-500) l c h / 0.2);
  }

  .admin-role-editor {
    background-color: oklch(from var(--color-success-500) l c h / 0.1);
    color: var(--color-success-600);
    border-color: oklch(from var(--color-success-500) l c h / 0.2);
  }

  .admin-role-user {
    background-color: var(--surface-inset);
    color: var(--text-secondary);
    border-color: var(--border-primary);
  }
}

/* ===================== Dark mode overrides ===================== */
html.dark {
  .admin-badge-published {
    background-color: oklch(from var(--color-success-500) l c h / 0.15);
    color: var(--color-success-500);
    border-color: oklch(from var(--color-success-500) l c h / 0.25);
  }

  .admin-badge-scheduled {
    background-color: oklch(from var(--color-brand-400) l c h / 0.15);
    color: var(--color-brand-400);
    border-color: oklch(from var(--color-brand-400) l c h / 0.25);
  }

  .admin-badge-trashed {
    background-color: oklch(from var(--color-danger-500) l c h / 0.15);
    color: var(--color-danger-500);
    border-color: oklch(from var(--color-danger-500) l c h / 0.25);
  }

  .admin-status-tab.active {
    color: var(--color-brand-400);
    border-bottom-color: var(--color-brand-400);
  }

  .admin-status-tab.active .admin-status-tab-count {
    background-color: oklch(from var(--color-brand-400) l c h / 0.15);
    color: var(--color-brand-400);
  }

  .admin-pagination-btn.active {
    background-color: var(--color-brand-500);
    border-color: var(--color-brand-500);
  }

  .admin-role-superadmin {
    background-color: oklch(0.25 0.05 310);
    color: oklch(0.80 0.15 310);
    border-color: oklch(0.35 0.08 310);
  }

  .admin-role-admin {
    background-color: oklch(from var(--color-brand-400) l c h / 0.15);
    color: var(--color-brand-400);
    border-color: oklch(from var(--color-brand-400) l c h / 0.25);
  }

  .admin-role-editor {
    background-color: oklch(from var(--color-success-500) l c h / 0.15);
    color: var(--color-success-500);
    border-color: oklch(from var(--color-success-500) l c h / 0.25);
  }

  .admin-action-btn-danger:hover {
    background-color: oklch(from var(--color-danger-500) l c h / 0.15);
  }

  .admin-search-input,
  .admin-filter-select,
  .admin-input {
    background-color: var(--surface-inset);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/styles/admin-table.css
git commit -m "feat: rebuild admin-table.css with OKLCH tinted badges and forms"
```

---

### Task 11: Wire CSS imports and clean up old files

**Files:**
- Modify: `src/app/globals.css` — update token import path
- Modify: `src/app/dashboard/assets/admin.css` → replace with import from engine OR delete and update dashboard layout
- Delete: `src/app/assets/tokens.css` (replaced by engine)
- Delete: `src/app/assets/admin-table.css` (replaced by engine)

- [ ] **Step 1: Update globals.css**

Replace the tokens import:

Old: `@import "./assets/tokens.css";`
New: `@import "../engine/styles/tokens.css";`

Full `src/app/globals.css`:
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
@custom-variant dark (html.dark &);
@import "../engine/styles/tokens.css";
@import "./assets/content.css";

@layer base {
  body {
    background-color: var(--surface-primary);
    color: var(--text-primary);
    font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
  }

  *:focus-visible {
    outline: 2px solid var(--color-brand-500);
    outline-offset: 2px;
  }
}
```

- [ ] **Step 2: Update dashboard admin.css**

Replace `src/app/dashboard/assets/admin.css` content with a single import from engine:

```css
@import "../../../engine/styles/admin.css";
```

This preserves the existing import chain (dashboard layout → admin.css → admin-table.css) while pointing to engine styles.

- [ ] **Step 3: Delete old style files**

```bash
rm src/app/assets/tokens.css
rm src/app/assets/admin-table.css
```

- [ ] **Step 4: Verify dev server renders correctly**

```bash
bun run dev
```

Open browser: check both light and dark mode on `/dashboard` and `/dashboard/cms/pages`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire engine styles, remove old token and table CSS files"
```

---

### Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update file structure section**

Add `src/engine/` to the file structure tree in CLAUDE.md. Update paths for moved files. Add section explaining engine vs project boundary:

Add after "## Architecture Overview":

```markdown
### Engine / Project Boundary

`src/engine/` contains reusable CMS infrastructure — do not modify per-project.
`src/config/`, `src/server/`, `src/app/`, `src/components/admin/` (forms) are project-specific.

Engine provides: config interfaces, types, RBAC policy, CRUD utils, hooks, shared components, styles.
Project provides: content type data, DB schema, routers, form components, routes, public UI.

Import rule: project imports from `@/core/*`. Engine imports from `@/server/db` and `@/lib/` (stable infrastructure).
```

Update the file structure tree to show `src/engine/` and remove moved files from their old locations.

Update the "Shared Utilities — Key Rules" section to use `@/core/` import paths.

- [ ] **Step 2: Update CSS architecture section**

Update to reference `src/engine/styles/` instead of old paths. Note the OKLCH system and `--brand-hue` customization point.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with engine architecture"
```

---

### Task 13: Final verification

- [ ] **Step 1: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS

- [ ] **Step 2: Run dev server**

```bash
bun run dev
```

Check:
- `/dashboard` — renders with new styles, both light and dark mode
- `/dashboard/cms/pages` — table renders correctly
- `/dashboard/cms/blog` — list view works
- `/dashboard/cms/pages/new` — form renders with RichTextEditor
- Theme toggle works

- [ ] **Step 3: Verify old paths cleaned up**

```bash
# Should find zero results — no remaining imports from old paths
grep -r "from '@/types/cms'" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old types/cms imports"
grep -r "from '@/lib/policy'" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old lib/policy imports"
grep -r "from '@/lib/slug'" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old lib/slug imports"
grep -r "from '@/lib/markdown'" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old lib/markdown imports"
grep -r "from '@/server/utils/admin-crud'" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old admin-crud imports"
grep -r "from '@/server/utils/taxonomy-helpers'" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old taxonomy-helpers imports"
grep -r "from '@/server/utils/cms-helpers'" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old cms-helpers imports"
grep -r "from '@/server/utils/content-revisions'" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old content-revisions imports"
grep -r "from '@/server/utils/slug-redirects'" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old slug-redirects imports"
grep -r "from '@/server/utils/audit'" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old audit imports"
grep -r "from '@/server/utils/webhooks'" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old webhooks imports"
grep -r "from '@/hooks/" src/ --include="*.ts" --include="*.tsx" || echo "OK: no old hooks imports"
grep -r "from '@/components/admin/CmsFormShell'" src/ --include="*.ts" --include="*.tsx" || echo "OK"
grep -r "from '@/components/admin/RichTextEditor'" src/ --include="*.ts" --include="*.tsx" || echo "OK"
grep -r "from '@/components/admin/SEOFields'" src/ --include="*.ts" --include="*.tsx" || echo "OK"
grep -r "from '@/components/admin/TagInput'" src/ --include="*.ts" --include="*.tsx" || echo "OK"
grep -r "from '@/components/admin/MediaPickerDialog'" src/ --include="*.ts" --include="*.tsx" || echo "OK"
grep -r "from '@/components/admin/CustomFieldsEditor'" src/ --include="*.ts" --include="*.tsx" || echo "OK"
grep -r "from '@/components/admin/RevisionHistory'" src/ --include="*.ts" --include="*.tsx" || echo "OK"
grep -r "from '@/components/admin/BulkActionBar'" src/ --include="*.ts" --include="*.tsx" || echo "OK"
```

All should print "OK".

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -A
git commit -m "chore: final verification and cleanup"
```
