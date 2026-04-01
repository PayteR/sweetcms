# CMS Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all missing CMS admin features from sai_flirtcam to sweetcms — editor image upload, height persistence, internal link picker, translation UI, SEO fields extraction, broken link validation, and centralized form state management.

**Architecture:** Additive changes to existing sweetcms structure. New hooks/components in existing directories. Backend additions to existing tRPC routers. Form refactors replace individual useState with centralized hook while preserving all existing functionality. Design tokens (not hardcoded colors) throughout.

**Tech Stack:** Next.js App Router, tRPC, Tiptap, Drizzle ORM, Zustand (toast), native `<dialog>` element, Tailwind with design tokens.

**Key sweetcms patterns (all new code must follow):**
- `import Link from 'next/link'` — NOT a custom wrapper
- `import { useRouter } from 'next/navigation'` — native Next.js
- `import { toast } from '@/store/toast-store'` — `toast.error(msg)` single arg (no title)
- `import { useBlankTranslations } from '@/lib/translations'` — admin i18n
- `import { cn } from '@/lib/utils'` — class merging
- Design tokens: `--surface-primary`, `--surface-secondary`, `--border-primary`, `--text-primary`, `--text-secondary`, `--text-muted`
- Admin card classes: `admin-card`, `admin-h2`
- Native `<dialog>` with `useRef<HTMLDialogElement>` + `showModal()`/`close()` — no Dialog component wrapper

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/constants.ts` | Modify | Add LOCALE_LABELS |
| `src/lib/extract-internal-links.ts` | Create | Parse markdown link URLs |
| `src/lib/datetime.ts` | Create | UTC↔Local datetime conversion |
| `src/hooks/useCmsFormState.ts` | Create | Centralized form state hook |
| `src/hooks/useLinkPicker.ts` | Create | Link picker modal state + editor ref |
| `src/hooks/useLinkValidation.ts` | Create | Post-save broken link detection |
| `src/server/routers/cms.ts` | Modify | Add validateLinks procedure |
| `src/components/admin/SEOFields.tsx` | Create | Extracted SEO form fields |
| `src/components/admin/TranslationBar.tsx` | Create | Language variant nav + duplicate |
| `src/components/admin/FallbackRadio.tsx` | Create | Translation fallback config |
| `src/components/admin/InternalLinkDialog.tsx` | Create | Content search + link insert |
| `src/components/admin/BrokenLinksBanner.tsx` | Create | Broken link warning banner |
| `src/components/admin/RichTextEditor.tsx` | Modify | Image upload, height persistence, EditorHandle |
| `src/components/admin/PostForm.tsx` | Rewrite | useCmsFormState + all new components |
| `src/components/admin/CategoryForm.tsx` | Rewrite | useCmsFormState + all new components |

---

## Task 1: Add LOCALE_LABELS to constants

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Add LOCALE_LABELS and export**

```typescript
// Add after line 9 (after Locale type):

/** Human-readable labels for each locale */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
};
```

- [ ] **Step 2: Verify typecheck**

Run: `cd E:/projects/sweetai/sweetcms && bunx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat: add LOCALE_LABELS to constants"
```

---

## Task 2: Create extract-internal-links utility

**Files:**
- Create: `src/lib/extract-internal-links.ts`

- [ ] **Step 1: Create the utility**

```typescript
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

/**
 * Extract internal (relative) link URLs from markdown content.
 * Returns deduplicated array of URL paths (e.g. ['/blog/my-post', '/privacy-policy']).
 */
export function extractInternalLinks(markdown: string): string[] {
  const urls = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = MARKDOWN_LINK_RE.exec(markdown)) !== null) {
    const url = match[2];
    // Only relative paths starting with /, skip protocol-relative //
    if (url.startsWith('/') && !url.startsWith('//')) {
      urls.add(url);
    }
  }

  return [...urls];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/extract-internal-links.ts
git commit -m "feat: add extractInternalLinks utility"
```

---

## Task 3: Create datetime utilities

**Files:**
- Create: `src/lib/datetime.ts`

- [ ] **Step 1: Create the utility**

```typescript
/**
 * Convert a UTC date to a local datetime-local input string (YYYY-MM-DDTHH:mm).
 */
export function convertUTCToLocal(
  utcDate: Date | string | null
): string {
  if (!utcDate) return '';
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  if (isNaN(date.getTime())) return '';
  // datetime-local expects local time — Date methods return local by default
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Convert a datetime-local input string to a UTC ISO string.
 */
export function convertLocalToUTC(localDateString: string): string {
  if (!localDateString) return '';
  const date = new Date(localDateString);
  if (isNaN(date.getTime())) return '';
  return date.toISOString();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/datetime.ts
git commit -m "feat: add UTC/local datetime conversion utils"
```

---

## Task 4: Create useCmsFormState hook

**Files:**
- Create: `src/hooks/useCmsFormState.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client';

import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { useBlankTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';

type AccentColor = 'info' | 'warning';

const BORDER_CLASSES: Record<AccentColor, string> = {
  info: 'border-(--border-primary) focus:border-blue-500',
  warning: 'border-(--border-primary) focus:border-yellow-500',
};

export function useCmsFormState<T extends Record<string, unknown>>(
  initialData: T,
  accentColor: AccentColor = 'info'
) {
  const __ = useBlankTranslations();
  const initialDataRef = useRef(initialData);
  const [formData, setFormData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const handleChange = useCallback(<V,>(field: keyof T, value: V) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field as string]) return prev;
      const next = { ...prev };
      delete next[field as string];
      return next;
    });
  }, []);

  const fieldErrorClass = (field: string) =>
    fieldErrors[field]
      ? 'border-red-500 focus:border-red-500'
      : BORDER_CLASSES[accentColor];

  const handleSaveError = useCallback(
    (error: unknown, fallbackMsg: string) => {
      setSaving(false);
      const err = error as Error & {
        fieldErrors?: Record<string, string[]>;
      };

      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors);
        const firstError = Object.values(err.fieldErrors)[0]?.[0];
        toast.error(firstError || __('Please check the form for errors'));
      } else {
        toast.error(err.message || __(fallbackMsg));
      }
    },
    [__]
  );

  return {
    formData,
    setFormData,
    saving,
    setSaving,
    fieldErrors,
    setFieldErrors,
    handleChange,
    fieldErrorClass,
    handleSaveError,
    initialData: initialDataRef.current,
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd E:/projects/sweetai/sweetcms && bunx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCmsFormState.ts
git commit -m "feat: add useCmsFormState centralized form hook"
```

---

## Task 5: Create useLinkPicker hook

**Files:**
- Create: `src/hooks/useLinkPicker.ts`

**Depends on:** Task 13 (EditorHandle type from RichTextEditor) — but can be created first with a local type import that will resolve after Task 13.

- [ ] **Step 1: Create the hook**

```typescript
import { useCallback, useRef, useState } from 'react';

import type { EditorHandle } from '@/components/admin/RichTextEditor';

/** Shared link picker state for CMS editor forms (PostForm, CategoryForm). */
export function useLinkPicker() {
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const editorRef = useRef<EditorHandle | null>(null);

  const handleLinkSelect = useCallback((title: string, url: string) => {
    editorRef.current?.replaceSelection(`[${title}](${url})`);
    setLinkPickerOpen(false);
  }, []);

  const openLinkPicker = useCallback(() => setLinkPickerOpen(true), []);
  const closeLinkPicker = useCallback(() => setLinkPickerOpen(false), []);

  return {
    linkPickerOpen,
    openLinkPicker,
    closeLinkPicker,
    handleLinkSelect,
    editorRef,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useLinkPicker.ts
git commit -m "feat: add useLinkPicker hook for internal link dialog"
```

---

## Task 6: Create useLinkValidation hook

**Files:**
- Create: `src/hooks/useLinkValidation.ts`

**Depends on:** Task 2 (extract-internal-links), Task 7 (validateLinks endpoint)

- [ ] **Step 1: Create the hook**

```typescript
import { useState } from 'react';

import { extractInternalLinks } from '@/lib/extract-internal-links';
import { trpc } from '@/lib/trpc/client';

/**
 * Post-save broken link validation for CMS forms.
 * Call `validateLinks(content)` after a successful edit save.
 */
export function useLinkValidation() {
  const [brokenLinks, setBrokenLinks] = useState<string[]>([]);
  const trpcUtils = trpc.useUtils();

  const validateLinks = async (content: string) => {
    const links = extractInternalLinks(content);
    if (links.length > 0) {
      try {
        const results = await trpcUtils.cms.validateLinks.fetch({
          urls: links,
        });
        const broken = results.filter((r) => !r.valid).map((r) => r.url);
        setBrokenLinks(broken);
      } catch {
        // Validation failure is non-critical
      }
    } else {
      setBrokenLinks([]);
    }
  };

  return {
    brokenLinks,
    validateLinks,
    dismissBrokenLinks: () => setBrokenLinks([]),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useLinkValidation.ts
git commit -m "feat: add useLinkValidation hook for broken link detection"
```

---

## Task 7: Add validateLinks procedure to CMS router

**Files:**
- Modify: `src/server/routers/cms.ts`

- [ ] **Step 1: Read the CMS router to find the right insertion point**

Read `src/server/routers/cms.ts` — find the last procedure before the router closing. Add the new procedure there.

- [ ] **Step 2: Add validateLinks procedure**

Add this procedure to the `cmsRouter` (before the closing `})`):

```typescript
  /**
   * Validate internal links — check which URLs resolve to published content.
   * Used by BrokenLinksBanner after post save.
   */
  validateLinks: contentProcedure
    .input(
      z.object({
        urls: z.array(z.string().max(500)).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const results: { url: string; valid: boolean }[] = [];

      for (const url of input.urls) {
        // Try to match against published CMS content URL patterns
        // URL patterns: /blog/slug, /page-slug, /category/slug, /tag/slug
        const segments = url.replace(/^\//, '').split('/');
        let found = false;

        if (segments.length === 1) {
          // Could be a page: /page-slug
          const [slug] = segments;
          const page = await ctx.db
            .select({ id: cmsPosts.id })
            .from(cmsPosts)
            .where(
              and(
                eq(cmsPosts.slug, slug),
                eq(cmsPosts.status, ContentStatus.PUBLISHED),
                isNull(cmsPosts.deletedAt)
              )
            )
            .limit(1);
          found = page.length > 0;
        } else if (segments.length === 2) {
          const [prefix, slug] = segments;
          if (prefix === 'blog') {
            const post = await ctx.db
              .select({ id: cmsPosts.id })
              .from(cmsPosts)
              .where(
                and(
                  eq(cmsPosts.slug, slug),
                  eq(cmsPosts.status, ContentStatus.PUBLISHED),
                  isNull(cmsPosts.deletedAt)
                )
              )
              .limit(1);
            found = post.length > 0;
          } else if (prefix === 'category') {
            const cat = await ctx.db
              .select({ id: cmsCategories.id })
              .from(cmsCategories)
              .where(
                and(
                  eq(cmsCategories.slug, slug),
                  eq(cmsCategories.status, ContentStatus.PUBLISHED),
                  isNull(cmsCategories.deletedAt)
                )
              )
              .limit(1);
            found = cat.length > 0;
          } else if (prefix === 'tag') {
            const tag = await ctx.db
              .select({ id: cmsTerms.id })
              .from(cmsTerms)
              .where(
                and(
                  eq(cmsTerms.slug, slug),
                  eq(cmsTerms.status, ContentStatus.PUBLISHED),
                  isNull(cmsTerms.deletedAt)
                )
              )
              .limit(1);
            found = tag.length > 0;
          }
        }

        results.push({ url, valid: found });
      }

      return results;
    }),
```

**Important:** Make sure `cmsTerms` is imported at the top of the file. Check existing imports — `cmsPosts` and `cmsCategories` should already be imported. Add `cmsTerms` from `@/server/db/schema/terms` if missing.

- [ ] **Step 3: Verify typecheck**

Run: `cd E:/projects/sweetai/sweetcms && bunx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/cms.ts
git commit -m "feat: add validateLinks tRPC procedure for broken link detection"
```

---

## Task 8: Add duplicateAsTranslation procedure

**Files:**
- Modify: `src/server/routers/cms.ts`
- Modify: `src/server/routers/categories.ts`

- [ ] **Step 1: Read both routers to understand existing duplicate mutations**

Read `src/server/routers/cms.ts` — find the `duplicate` procedure (around line 424).
Read `src/server/routers/categories.ts` — find the `duplicate` procedure (around line 205).

- [ ] **Step 2: Add duplicateAsTranslation to CMS router**

Add after the existing `duplicate` procedure:

```typescript
  /**
   * Duplicate a post as a translation in a different language.
   * Creates/shares translationGroup and navigates to the new post.
   */
  duplicateAsTranslation: contentProcedure
    .input(
      z.object({
        id: z.string(),
        targetLang: z.string().min(2).max(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.db.query.cmsPosts.findFirst({
        where: eq(cmsPosts.id, input.id),
      });
      if (!source) throw new TRPCError({ code: 'NOT_FOUND' });

      // Create or reuse translation group
      const translationGroup =
        source.translationGroup || crypto.randomUUID();

      // If source had no group, update it
      if (!source.translationGroup) {
        await ctx.db
          .update(cmsPosts)
          .set({ translationGroup })
          .where(eq(cmsPosts.id, input.id));
      }

      // Generate unique slug
      let slug = `${source.slug}-${input.targetLang}`;
      const existing = await ctx.db
        .select({ slug: cmsPosts.slug })
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.slug, slug),
            eq(cmsPosts.lang, input.targetLang),
            isNull(cmsPosts.deletedAt)
          )
        )
        .limit(1);
      if (existing.length > 0) {
        slug = `${slug}-${Date.now()}`;
      }

      const [newPost] = await ctx.db
        .insert(cmsPosts)
        .values({
          ...source,
          id: crypto.randomUUID(),
          slug,
          lang: input.targetLang,
          translationGroup,
          status: ContentStatus.DRAFT,
          publishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        })
        .$returningId();

      return { id: newPost.id, slug };
    }),
```

- [ ] **Step 3: Add duplicateAsTranslation to categories router**

Same pattern but for categories table. Add after existing `duplicate`:

```typescript
  duplicateAsTranslation: sectionProcedure('content')
    .input(
      z.object({
        id: z.string(),
        targetLang: z.string().min(2).max(5),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.db.query.cmsCategories.findFirst({
        where: eq(cmsCategories.id, input.id),
      });
      if (!source) throw new TRPCError({ code: 'NOT_FOUND' });

      const translationGroup =
        source.translationGroup || crypto.randomUUID();

      if (!source.translationGroup) {
        await ctx.db
          .update(cmsCategories)
          .set({ translationGroup })
          .where(eq(cmsCategories.id, input.id));
      }

      let slug = `${source.slug}-${input.targetLang}`;
      const existing = await ctx.db
        .select({ slug: cmsCategories.slug })
        .from(cmsCategories)
        .where(
          and(
            eq(cmsCategories.slug, slug),
            eq(cmsCategories.lang, input.targetLang),
            isNull(cmsCategories.deletedAt)
          )
        )
        .limit(1);
      if (existing.length > 0) {
        slug = `${slug}-${Date.now()}`;
      }

      const [newCat] = await ctx.db
        .insert(cmsCategories)
        .values({
          ...source,
          id: crypto.randomUUID(),
          slug,
          lang: input.targetLang,
          translationGroup,
          status: ContentStatus.DRAFT,
          publishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        })
        .$returningId();

      return { id: newCat.id, slug };
    }),
```

- [ ] **Step 4: Verify typecheck**

Run: `cd E:/projects/sweetai/sweetcms && bunx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/cms.ts src/server/routers/categories.ts
git commit -m "feat: add duplicateAsTranslation for cross-language content duplication"
```

---

## Task 9: Create SEOFields component

**Files:**
- Create: `src/components/admin/SEOFields.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface SEOFieldsProps {
  seoTitle: string;
  metaDescription: string;
  noindex: boolean;
  onSeoTitleChange: (value: string) => void;
  onMetaDescriptionChange: (value: string) => void;
  onNoindexChange: (value: boolean) => void;
  fieldErrors?: Record<string, string[]>;
  /** Focus border color class for inputs */
  focusBorderClass?: string;
}

export function SEOFields({
  seoTitle,
  metaDescription,
  noindex,
  onSeoTitleChange,
  onMetaDescriptionChange,
  onNoindexChange,
  fieldErrors,
  focusBorderClass = 'focus:border-blue-500',
}: SEOFieldsProps) {
  const __ = useBlankTranslations();

  return (
    <>
      <div>
        <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
          {__('SEO Title')}
        </label>
        <input
          type="text"
          value={seoTitle}
          onChange={(e) => onSeoTitleChange(e.target.value)}
          placeholder={__('Optional SEO title for <title> tag')}
          maxLength={255}
          className={cn(
            'w-full rounded-lg border bg-(--surface-primary) px-4 py-2 text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none',
            fieldErrors?.seo_title
              ? 'border-red-500 focus:border-red-500'
              : ['border-(--border-primary)', focusBorderClass]
          )}
        />
        {fieldErrors?.seo_title ? (
          <p className="mt-1 text-sm text-red-400">
            {fieldErrors.seo_title[0]}
          </p>
        ) : (
          <p className="mt-1 text-xs text-(--text-muted)">
            {__('Falls back to Title if empty')}
          </p>
        )}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
          {__('Meta Description')}
        </label>
        <textarea
          value={metaDescription}
          onChange={(e) => onMetaDescriptionChange(e.target.value)}
          placeholder={__('SEO meta description (max 160 chars)')}
          maxLength={160}
          rows={3}
          className={cn(
            'w-full rounded-lg border bg-(--surface-primary) px-4 py-2 text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none',
            fieldErrors?.meta_description
              ? 'border-red-500 focus:border-red-500'
              : ['border-(--border-primary)', focusBorderClass]
          )}
        />
        {fieldErrors?.meta_description ? (
          <p className="mt-1 text-sm text-red-400">
            {fieldErrors.meta_description[0]}
          </p>
        ) : (
          <p className="mt-1 text-xs text-(--text-muted)">
            {metaDescription.length}/160
          </p>
        )}
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-(--text-secondary)">
          <input
            type="checkbox"
            checked={noindex}
            onChange={(e) => onNoindexChange(e.target.checked)}
            className="h-4 w-4 rounded border-(--border-primary) bg-(--surface-primary)"
          />
          {__('Noindex')}
        </label>
        <p className="mt-1 text-xs text-(--text-muted)">
          {__('Exclude from search engine indexing (adds noindex meta tag)')}
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/SEOFields.tsx
git commit -m "feat: add SEOFields reusable component"
```

---

## Task 10: Create TranslationBar component

**Files:**
- Create: `src/components/admin/TranslationBar.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useState } from 'react';

import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';

import { type Locale, LOCALES, LOCALE_LABELS } from '@/lib/constants';
import { useBlankTranslations } from '@/lib/translations';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

interface Translation {
  id: string;
  lang: string;
  slug: string;
}

interface TranslationBarProps {
  currentLang: string;
  translations: Translation[];
  /** Admin URL slug for the content type (e.g. 'blog' → /dashboard/content/blog/{id}) */
  adminSlug: string;
  /** Called when user clicks a missing-language button. Should duplicate + navigate. */
  onDuplicate: (targetLang: Locale) => Promise<void>;
}

export function TranslationBar({
  currentLang,
  translations,
  adminSlug,
  onDuplicate,
}: TranslationBarProps) {
  const __ = useBlankTranslations();
  const [duplicating, setDuplicating] = useState<string | null>(null);

  const existingLangs = new Set([
    currentLang,
    ...translations.map((t) => t.lang),
  ]);
  const missingLangs = LOCALES.filter((l) => !existingLangs.has(l));

  const handleDuplicate = async (lang: Locale) => {
    setDuplicating(lang);
    try {
      await onDuplicate(lang);
    } catch (error) {
      setDuplicating(null);
      const msg =
        error instanceof Error
          ? error.message
          : __('Failed to create translation');
      toast.error(msg);
    }
  };

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
        {__('Language')}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {/* Current language — solid badge */}
        <span className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white">
          {LOCALE_LABELS[currentLang as Locale] ?? currentLang}
        </span>

        {/* Existing translations — outline link badges */}
        {translations.map((t) => (
          <Link
            key={t.lang}
            href={`/dashboard/content/${adminSlug}/${t.id}`}
            className="rounded-md border border-(--border-primary) px-3 py-1 text-sm text-(--text-secondary) transition-colors hover:border-blue-500 hover:text-(--text-primary)"
          >
            {LOCALE_LABELS[t.lang as Locale] ?? t.lang}
          </Link>
        ))}

        {/* Missing languages — dashed "+" buttons */}
        {missingLangs.map((lang) => (
          <button
            key={lang}
            type="button"
            disabled={duplicating !== null}
            onClick={() => handleDuplicate(lang)}
            className={cn(
              'flex items-center gap-1 rounded-md border border-dashed border-(--border-primary) px-3 py-1 text-sm text-(--text-muted) transition-colors',
              duplicating === lang
                ? 'cursor-wait'
                : 'hover:border-blue-500 hover:text-(--text-secondary)'
            )}
          >
            {duplicating === lang ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            {LOCALE_LABELS[lang]}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/TranslationBar.tsx
git commit -m "feat: add TranslationBar component for translation management"
```

---

## Task 11: Create FallbackRadio component

**Files:**
- Create: `src/components/admin/FallbackRadio.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { useId } from 'react';

import type { ContentTypeDeclaration } from '@/config/cms';
import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface FallbackRadioProps {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  ct: ContentTypeDeclaration;
}

export function FallbackRadio({
  value,
  onChange,
  ct,
}: FallbackRadioProps) {
  const __ = useBlankTranslations();
  const radioName = useId();

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
        {__('Language Fallback')}
      </label>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-(--text-secondary) cursor-pointer">
          <input
            type="radio"
            name={radioName}
            checked={value === null}
            onChange={() => onChange(null)}
            className="h-4 w-4 border-(--border-primary) bg-(--surface-primary)"
          />
          {__('Default')}
          <span className="text-xs text-(--text-muted)">
            (
            {ct.fallbackToDefault
              ? __('Show EN version for missing translations')
              : __('404 for missing translations')}
            )
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-(--text-secondary) cursor-pointer">
          <input
            type="radio"
            name={radioName}
            checked={value === true}
            onChange={() => onChange(true)}
            className="h-4 w-4 border-(--border-primary) bg-(--surface-primary)"
          />
          {__('Always Fallback')}
        </label>
        <label className="flex items-center gap-2 text-sm text-(--text-secondary) cursor-pointer">
          <input
            type="radio"
            name={radioName}
            checked={value === false}
            onChange={() => onChange(false)}
            className="h-4 w-4 border-(--border-primary) bg-(--surface-primary)"
          />
          {__('Never Fallback')}
        </label>
      </div>
      <p className="mt-1 text-xs text-(--text-muted)">
        {__(
          'Controls whether this content is shown when visiting in a language without a translation'
        )}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/FallbackRadio.tsx
git commit -m "feat: add FallbackRadio component for translation fallback config"
```

---

## Task 12: Create InternalLinkDialog component

**Files:**
- Create: `src/components/admin/InternalLinkDialog.tsx`

Uses native `<dialog>` element following sweetcms pattern (not a Dialog wrapper).

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { FileText, FolderOpen, Search, Tag } from 'lucide-react';

import { useBlankTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof FileText; color: string }
> = {
  page: { label: 'Page', icon: FileText, color: 'bg-blue-600' },
  blog: { label: 'Blog', icon: FileText, color: 'bg-purple-600' },
  category: { label: 'Category', icon: FolderOpen, color: 'bg-yellow-600' },
  tag: { label: 'Tag', icon: Tag, color: 'bg-green-600' },
};

const DEFAULT_TYPE_CONFIG = {
  label: 'Content',
  icon: FileText,
  color: 'bg-gray-600',
};

interface InternalLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (title: string, url: string) => void;
}

function InternalLinkDialog({
  isOpen,
  onClose,
  onSelect,
}: InternalLinkDialogProps) {
  const __ = useBlankTranslations();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open/close dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      setQuery('');
      setDebouncedQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Handle backdrop click and escape
  const handleDialogClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) onClose();
    },
    [onClose]
  );

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setDebouncedQuery('');
      return;
    }
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const { data: results, isLoading } = trpc.contentSearch.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

  return (
    <dialog
      ref={dialogRef}
      onClick={handleDialogClick}
      onClose={onClose}
      className="w-full max-w-lg rounded-xl border border-(--border-primary) bg-(--surface-primary) p-0 text-(--text-primary) shadow-xl backdrop:bg-black/50"
    >
      <div className="p-4">
        <h2 className="mb-4 text-lg font-semibold">
          {__('Insert Internal Link')}
        </h2>

        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={__('Search pages, blog posts, categories...')}
            className="w-full rounded-lg border border-(--border-primary) bg-(--surface-secondary) py-2 pl-10 pr-4 text-(--text-primary) placeholder:text-(--text-muted) focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="mt-4 max-h-80 min-h-[120px] overflow-y-auto">
          {isLoading && debouncedQuery.length >= 2 && (
            <div className="flex items-center justify-center py-8 text-(--text-muted)">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-(--border-primary) border-t-blue-400" />
              <span className="ml-2">{__('Searching...')}</span>
            </div>
          )}

          {!isLoading &&
            debouncedQuery.length >= 2 &&
            results?.length === 0 && (
              <div className="py-8 text-center text-(--text-muted)">
                {__('No results found')}
              </div>
            )}

          {!isLoading && debouncedQuery.length < 2 && (
            <div className="py-8 text-center text-(--text-muted)">
              {__('Type at least 2 characters to search')}
            </div>
          )}

          {results && results.length > 0 && (
            <div className="space-y-1">
              {results.map((result, idx) => {
                const config =
                  TYPE_CONFIG[result.type] ?? DEFAULT_TYPE_CONFIG;
                const Icon = config.icon;
                return (
                  <button
                    key={`${result.type}-${result.id}-${idx}`}
                    type="button"
                    onClick={() => onSelect(result.title, result.url)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-(--surface-secondary)"
                  >
                    <Icon
                      size={16}
                      className="shrink-0 text-(--text-muted)"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-(--text-primary)">
                        {result.title}
                      </div>
                      <div className="truncate text-xs text-(--text-muted)">
                        {result.url}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-xs text-white',
                        config.color
                      )}
                    >
                      {__(config.label)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-(--border-primary) px-4 py-2 text-sm text-(--text-secondary) transition-colors hover:bg-(--surface-secondary)"
          >
            {__('Cancel')}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default memo(InternalLinkDialog);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/InternalLinkDialog.tsx
git commit -m "feat: add InternalLinkDialog for internal content link search"
```

---

## Task 13: Create BrokenLinksBanner component

**Files:**
- Create: `src/components/admin/BrokenLinksBanner.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

import { memo } from 'react';

import { X } from 'lucide-react';

import { useBlankTranslations } from '@/lib/translations';

interface BrokenLinksBannerProps {
  urls: string[];
  onDismiss: () => void;
}

function BrokenLinksBanner({ urls, onDismiss }: BrokenLinksBannerProps) {
  const __ = useBlankTranslations();

  if (urls.length === 0) return null;

  return (
    <div className="rounded-lg border border-yellow-600/50 bg-yellow-600/10 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-yellow-400">
          {__('Broken internal links detected:')}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-yellow-400 hover:text-yellow-300"
        >
          <X size={16} />
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {urls.map((url) => (
          <li key={url} className="font-mono text-xs text-yellow-300">
            {url}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default memo(BrokenLinksBanner);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/BrokenLinksBanner.tsx
git commit -m "feat: add BrokenLinksBanner component"
```

---

## Task 14: Enhance RichTextEditor with image upload, height persistence, EditorHandle

**Files:**
- Modify: `src/components/admin/RichTextEditor.tsx`

This is the largest single task. The existing RichTextEditor (468 lines) needs these additions while preserving all current functionality (shortcodes, formatting, source toggle).

- [ ] **Step 1: Read current RichTextEditor.tsx fully**

Read `src/components/admin/RichTextEditor.tsx` to understand the complete current implementation.

- [ ] **Step 2: Add EditorHandle export and new props**

At the top of the file, add the `EditorHandle` interface export and update `Props`:

```typescript
/** Imperative handle for programmatic editor control (used by useLinkPicker). */
export interface EditorHandle {
  replaceSelection: (text: string) => void;
}

interface Props {
  content: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // NEW props:
  /** Post ID for image upload context */
  postId?: string;
  /** Default height (CSS value, e.g. '400px') */
  height?: string;
  /** localStorage key suffix for height persistence */
  storageKey?: string;
  /** Called when user clicks the internal link toolbar button */
  onRequestLinkPicker?: () => void;
  /** Ref to expose EditorHandle for programmatic content insertion */
  editorRef?: React.RefObject<EditorHandle | null>;
}
```

- [ ] **Step 3: Add image upload function**

Add before the component function:

```typescript
async function uploadImage(
  file: File,
  postId?: string
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  if (postId) formData.append('postId', postId);

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Upload failed');
  }

  const data = await res.json();
  return data.url;
}
```

- [ ] **Step 4: Implement EditorHandle via editorRef**

Inside the component, after editor initialization, add the imperative handle:

```typescript
// Expose EditorHandle via editorRef
useEffect(() => {
  if (!editorRef) return;
  editorRef.current = {
    replaceSelection: (text: string) => {
      if (mode === 'source') {
        // Insert at cursor in textarea
        const textarea = document.querySelector(
          '.tiptap-source-textarea'
        ) as HTMLTextAreaElement | null;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const before = sourceValue.slice(0, start);
          const after = sourceValue.slice(end);
          const newValue = before + text + after;
          setSourceValue(newValue);
          onChange(newValue);
          // Restore cursor after inserted text
          requestAnimationFrame(() => {
            textarea.selectionStart = textarea.selectionEnd =
              start + text.length;
            textarea.focus();
          });
        }
      } else if (editor) {
        // Parse [title](url) and insert as link
        const linkMatch = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const [, title, url] = linkMatch;
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'text',
              marks: [{ type: 'link', attrs: { href: url } }],
              text: title,
            })
            .run();
        } else {
          editor.chain().focus().insertContent(text).run();
        }
      }
    },
  };
  return () => {
    if (editorRef) editorRef.current = null;
  };
}, [editor, editorRef, mode, sourceValue, onChange]);
```

- [ ] **Step 5: Add image upload handlers to editor config**

In the `useEditor` call, add `editorProps` for paste/drop handling:

```typescript
editorProps: {
  handlePaste: (view, event) => {
    const items = event.clipboardData?.items;
    if (!items) return false;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
          uploadImage(file, postId).then((url) => {
            editor?.chain().focus().setImage({ src: url }).run();
          }).catch((err) => {
            toast.error(err.message || __('Image upload failed'));
          });
        }
        return true;
      }
    }
    return false;
  },
  handleDrop: (view, event) => {
    const files = event.dataTransfer?.files;
    if (!files?.length) return false;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        event.preventDefault();
        uploadImage(file, postId).then((url) => {
          editor?.chain().focus().setImage({ src: url }).run();
        }).catch((err) => {
          toast.error(err.message || __('Image upload failed'));
        });
        return true;
      }
    }
    return false;
  },
},
```

- [ ] **Step 6: Replace window.prompt image insertion with file upload**

Replace the existing Image toolbar button handler. Instead of `window.prompt('Enter image URL:')`, use a hidden file input:

```typescript
// Add ref at component top:
const imageInputRef = useRef<HTMLInputElement>(null);

// Replace the Image toolbar button onClick:
onClick={() => imageInputRef.current?.click()}

// Add hidden input in JSX (after toolbar, before editor content):
<input
  ref={imageInputRef}
  type="file"
  accept="image/*"
  className="hidden"
  onChange={async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    e.target.value = ''; // reset for re-upload
    try {
      const url = await uploadImage(file, postId);
      editor.chain().focus().setImage({ src: url }).run();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : __('Image upload failed')
      );
    }
  }}
/>
```

- [ ] **Step 7: Add internal link toolbar button**

Add a new toolbar button in the Link group (after the existing Link button). Only renders if `onRequestLinkPicker` is provided:

```typescript
{onRequestLinkPicker && (
  <ToolbarButton
    onClick={onRequestLinkPicker}
    title={__('Internal Link')}
    active={false}
  >
    <FileSearch size={18} />
  </ToolbarButton>
)}
```

Add `FileSearch` to the lucide-react imports.

- [ ] **Step 8: Add height persistence**

Add height persistence using ResizeObserver + localStorage:

```typescript
const HEIGHT_STORAGE_PREFIX = 'cms-editor-h:';

// Inside component, after refs:
const wrapperRef = useRef<HTMLDivElement>(null);

// Height persistence effect:
useEffect(() => {
  if (!storageKey) return;
  const wrapper = wrapperRef.current;
  if (!wrapper) return;

  // Restore saved height
  const savedHeight = localStorage.getItem(
    HEIGHT_STORAGE_PREFIX + storageKey
  );
  if (savedHeight) {
    wrapper.style.height = savedHeight;
  }

  // Observe resize
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const h = Math.round(entry.contentRect.height);
      if (h > 0) {
        localStorage.setItem(
          HEIGHT_STORAGE_PREFIX + storageKey,
          `${h}px`
        );
      }
    }
  });
  observer.observe(wrapper);
  return () => observer.disconnect();
}, [storageKey]);
```

Add `ref={wrapperRef}` to the editor wrapper div and ensure it has `style={{ height: height ?? '400px' }}` as default plus `resize: 'vertical'` in the wrapper's style or via CSS class.

- [ ] **Step 9: Verify typecheck**

Run: `cd E:/projects/sweetai/sweetcms && bunx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 10: Commit**

```bash
git add src/components/admin/RichTextEditor.tsx
git commit -m "feat: enhance RichTextEditor with image upload, height persistence, EditorHandle"
```

---

## Task 15: Refactor PostForm with useCmsFormState and all new components

**Files:**
- Rewrite: `src/components/admin/PostForm.tsx`

This is the largest task. The current PostForm (667 lines) uses 16 individual `useState` calls. Refactor to `useCmsFormState` and integrate all new components.

- [ ] **Step 1: Read current PostForm.tsx fully**

Read `src/components/admin/PostForm.tsx` to understand the complete current implementation — all fields, mutations, layout, and integrations.

- [ ] **Step 2: Define PostFormData type and compute initialData**

Replace the 16 individual `useState` calls with a typed object:

```typescript
interface PostFormData {
  title: string;
  slug: string;
  content: string;
  status: string;
  lang: string;
  metaDescription: string;
  seoTitle: string;
  featuredImage: string;
  featuredImageAlt: string;
  jsonLd: string;
  noindex: boolean;
  publishedAt: string;
  categoryIds: string[];
  tagIds: string[];
  parentId: string | null;
  fallbackToDefault: boolean | null;
}
```

Compute `initialData` from the post prop (or defaults for new):

```typescript
const initialFormData: PostFormData = useMemo(() => {
  if (!post) {
    return {
      title: '', slug: '', content: '', status: ContentStatus.DRAFT,
      lang: DEFAULT_LOCALE, metaDescription: '', seoTitle: '',
      featuredImage: '', featuredImageAlt: '', jsonLd: '', noindex: false,
      publishedAt: '', categoryIds: [], tagIds: [], parentId: null,
      fallbackToDefault: null,
    };
  }
  return {
    title: post.title,
    slug: post.slug,
    content: post.content || '',
    status: post.status,
    lang: post.lang || DEFAULT_LOCALE,
    metaDescription: post.metaDescription || '',
    seoTitle: post.seoTitle || '',
    featuredImage: post.featuredImage || '',
    featuredImageAlt: post.featuredImageAlt || '',
    jsonLd: post.jsonLd || '',
    noindex: post.noindex || false,
    publishedAt: post.publishedAt ? convertUTCToLocal(post.publishedAt) : '',
    categoryIds: post.categoryIds || [],
    tagIds: post.tagIds || [],
    parentId: post.parentId || null,
    fallbackToDefault: post.fallbackToDefault ?? null,
  };
}, [post]);
```

- [ ] **Step 3: Replace useState calls with useCmsFormState**

```typescript
const {
  formData, setFormData, saving, setSaving,
  fieldErrors, handleChange, fieldErrorClass, handleSaveError,
  initialData,
} = useCmsFormState(initialFormData, 'info');
```

Replace all `setTitle(x)` → `handleChange('title', x)`, `setSlug(x)` → `handleChange('slug', x)`, etc.

Access values as `formData.title`, `formData.slug`, etc.

Keep `slugManual` and `showMediaPicker` as separate `useState` (they're UI state, not form data).

- [ ] **Step 4: Add new hook integrations**

```typescript
// Link picker
const { linkPickerOpen, openLinkPicker, closeLinkPicker, handleLinkSelect, editorRef } = useLinkPicker();

// Link validation (edit mode only)
const { brokenLinks, validateLinks, dismissBrokenLinks } = useLinkValidation();

// Duplicate as translation
const duplicateAsTranslation = trpc.cms.duplicateAsTranslation.useMutation();
```

- [ ] **Step 5: Add new components to the render**

In the **sidebar** (right column), add after status/language section:

```tsx
{/* TranslationBar — edit mode only, when post has translations data */}
{post && (
  <TranslationBar
    currentLang={formData.lang}
    translations={post.translations || []}
    adminSlug={contentType.adminSlug}
    onDuplicate={async (targetLang) => {
      const result = await duplicateAsTranslation.mutateAsync({
        id: post.id,
        targetLang,
      });
      router.push(`/dashboard/content/${contentType.adminSlug}/${result.id}`);
    }}
  />
)}

{/* FallbackRadio — edit mode only */}
{post && (
  <FallbackRadio
    value={formData.fallbackToDefault}
    onChange={(v) => handleChange('fallbackToDefault', v)}
    ct={contentType}
  />
)}
```

Replace inline SEO fields with:
```tsx
<SEOFields
  seoTitle={formData.seoTitle}
  metaDescription={formData.metaDescription}
  noindex={formData.noindex}
  onSeoTitleChange={(v) => handleChange('seoTitle', v)}
  onMetaDescriptionChange={(v) => handleChange('metaDescription', v)}
  onNoindexChange={(v) => handleChange('noindex', v)}
  fieldErrors={fieldErrors}
/>
```

Add **BrokenLinksBanner** after the recovery banner:
```tsx
<BrokenLinksBanner urls={brokenLinks} onDismiss={dismissBrokenLinks} />
```

Add **InternalLinkDialog** at the end:
```tsx
<InternalLinkDialog
  isOpen={linkPickerOpen}
  onClose={closeLinkPicker}
  onSelect={handleLinkSelect}
/>
```

- [ ] **Step 6: Update RichTextEditor props**

```tsx
<RichTextEditor
  content={formData.content}
  onChange={(v) => handleChange('content', v)}
  postId={post?.id}
  storageKey={`post-${post?.id ?? 'new'}`}
  onRequestLinkPicker={openLinkPicker}
  editorRef={editorRef}
/>
```

- [ ] **Step 7: Add post-save link validation**

In the save success handler, after existing logic:
```typescript
if (post) {
  validateLinks(formData.content);
}
```

- [ ] **Step 8: Smart back button**

Update the back button from plain Link to smart history-aware:
```tsx
<button
  type="button"
  onClick={() => {
    if (window.history.length > 1) router.back();
    else router.push(`/dashboard/content/${contentType.adminSlug}`);
  }}
  className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
>
  <ArrowLeft className="h-5 w-5" />
</button>
```

- [ ] **Step 9: Update imports**

Add new imports:
```typescript
import { convertUTCToLocal, convertLocalToUTC } from '@/lib/datetime';
import { useCmsFormState } from '@/hooks/useCmsFormState';
import { useLinkPicker } from '@/hooks/useLinkPicker';
import { useLinkValidation } from '@/hooks/useLinkValidation';
import { SEOFields } from './SEOFields';
import { TranslationBar } from './TranslationBar';
import { FallbackRadio } from './FallbackRadio';
import InternalLinkDialog from './InternalLinkDialog';
import BrokenLinksBanner from './BrokenLinksBanner';
```

- [ ] **Step 10: Update save mutation to include new fields**

In the create/update mutation calls, add:
```typescript
fallbackToDefault: formData.fallbackToDefault,
publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : undefined,
```

- [ ] **Step 11: Verify typecheck**

Run: `cd E:/projects/sweetai/sweetcms && bunx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 12: Commit**

```bash
git add src/components/admin/PostForm.tsx
git commit -m "refactor: PostForm to useCmsFormState + integrate translation, link picker, SEO, validation"
```

---

## Task 16: Refactor CategoryForm with useCmsFormState and all new components

**Files:**
- Rewrite: `src/components/admin/CategoryForm.tsx`

Same pattern as PostForm but for categories. The current CategoryForm (478 lines) needs the same refactor.

- [ ] **Step 1: Read current CategoryForm.tsx fully**

Read `src/components/admin/CategoryForm.tsx`.

- [ ] **Step 2: Define CategoryFormData type**

```typescript
interface CategoryFormData {
  name: string;
  slug: string;
  title: string;
  text: string;
  status: string;
  lang: string;
  icon: string;
  order: number;
  metaDescription: string;
  seoTitle: string;
  noindex: boolean;
  publishedAt: string;
  tagIds: string[];
  fallbackToDefault: boolean | null;
}
```

- [ ] **Step 3: Replace useState with useCmsFormState**

Same pattern as PostForm Task 15 Step 3. Compute `initialFormData` from category prop, use `useCmsFormState(initialFormData, 'info')`.

- [ ] **Step 4: Add new hook integrations**

```typescript
const { linkPickerOpen, openLinkPicker, closeLinkPicker, handleLinkSelect, editorRef } = useLinkPicker();
const { brokenLinks, validateLinks, dismissBrokenLinks } = useLinkValidation();
const duplicateAsTranslation = trpc.categories.duplicateAsTranslation.useMutation();
```

- [ ] **Step 5: Add new components to render**

Same as PostForm: TranslationBar, FallbackRadio, SEOFields, BrokenLinksBanner, InternalLinkDialog. Update RichTextEditor props. Smart back button.

- [ ] **Step 6: Update save mutation**

Include `fallbackToDefault` field in create/update calls.

- [ ] **Step 7: Verify typecheck**

Run: `cd E:/projects/sweetai/sweetcms && bunx tsc --noEmit --pretty 2>&1 | head -30`

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/CategoryForm.tsx
git commit -m "refactor: CategoryForm to useCmsFormState + integrate translation, link picker, SEO, validation"
```

---

## Task 17: Final verification

- [ ] **Step 1: Full typecheck**

Run: `cd E:/projects/sweetai/sweetcms && bunx tsc --noEmit --pretty`

Fix any remaining type errors.

- [ ] **Step 2: Verify no broken imports**

Run: `cd E:/projects/sweetai/sweetcms && grep -r "ToastUIEditor\|toast-ui" src/ --include="*.tsx" --include="*.ts"`

Should return nothing (no stale Toast UI references).

- [ ] **Step 3: Verify all new files exist**

```bash
ls -la src/lib/extract-internal-links.ts src/lib/datetime.ts src/hooks/useCmsFormState.ts src/hooks/useLinkPicker.ts src/hooks/useLinkValidation.ts src/components/admin/SEOFields.tsx src/components/admin/TranslationBar.tsx src/components/admin/FallbackRadio.tsx src/components/admin/InternalLinkDialog.tsx src/components/admin/BrokenLinksBanner.tsx
```

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve type errors from CMS feature parity integration"
```
