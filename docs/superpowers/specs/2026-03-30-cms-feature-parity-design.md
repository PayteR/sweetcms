# SweetCMS Feature Parity with Flirtcam CMS

Port all missing CMS admin features from sai_flirtcam to sweetcms. Goal: make sweetcms a complete skeleton CMS ready for custom functionality.

## Scope

### A. New Hooks

**1. `useCmsFormState<T>` (`src/hooks/useCmsFormState.ts`)**
Centralized form state management replacing individual `useState` calls in PostForm/CategoryForm.

```typescript
interface UseCmsFormStateReturn<T> {
  formData: T;
  setFormData: Dispatch<SetStateAction<T>>;
  saving: boolean;
  setSaving: Dispatch<SetStateAction<boolean>>;
  fieldErrors: Record<string, string[]>;
  setFieldErrors: Dispatch<...>;
  handleChange: <V>(field: keyof T, value: V) => void;
  fieldErrorClass: (field: string) => string;
  handleSaveError: (error: unknown, fallbackMsg: string) => void;
  initialData: T;
}
```

- `handleChange(field, value)` — updates field + clears its error
- `fieldErrorClass(field)` — returns danger border class if field has errors
- `handleSaveError(error, msg)` — extracts `fieldErrors` from tRPC error shape, shows toast
- `initialData` — ref-preserved for autosave baseline comparison

**2. `useLinkPicker` (`src/hooks/useLinkPicker.ts`)**
Modal state + EditorHandle ref for InternalLinkDialog integration.

```typescript
returns { linkPickerOpen, openLinkPicker, closeLinkPicker, handleLinkSelect, editorRef }
```

- `handleLinkSelect(title, url)` — calls `editorRef.current.replaceSelection(\`[${title}](${url})\`)`

**3. `useLinkValidation` (`src/hooks/useLinkValidation.ts`)**
Post-save broken link detection.

```typescript
returns { brokenLinks: string[], validateLinks: (content: string) => Promise<void>, dismissBrokenLinks }
```

- Extracts internal links from markdown via `extractInternalLinks()`
- Validates via `trpc.cms.validateLinks.fetch({ urls })`
- Non-blocking (catches errors silently)

### B. New Components

**4. `SEOFields.tsx` (`src/components/admin/SEOFields.tsx`)**
Extracted from PostForm/CategoryForm inline SEO fields. Pure presentational.

Props: `seoTitle, metaDescription, noindex, onSeoTitleChange, onMetaDescriptionChange, onNoindexChange, fieldErrors?, focusBorderClass?`

Fields: SEO Title (max 255, hint "Falls back to Title if empty"), Meta Description (max 160, char count), Noindex checkbox.

**5. `TranslationBar.tsx` (`src/components/admin/TranslationBar.tsx`)**
Language variant navigation + duplicate creation.

Props: `currentLang, translations: { id, lang, slug }[], adminSlug, onDuplicate: (targetLang) => Promise<void>`

Renders:
- Current language — solid badge
- Existing translations — link badges (navigate to edit page)
- Missing languages — dashed "+" buttons → calls `onDuplicate(lang)`

Uses `LOCALES` and new `LOCALE_LABELS` from constants.

**6. `FallbackRadio.tsx` (`src/components/admin/FallbackRadio.tsx`)**
Translation fallback behavior config.

Props: `value: boolean | null, onChange, contentType`

Options: null (use content type default), true (always show EN fallback), false (always 404).

**7. `InternalLinkDialog.tsx` (`src/components/admin/InternalLinkDialog.tsx`)**
Search internal content + insert as markdown link.

Props: `isOpen, onClose, onSelect: (title, url) => void`

- Debounced search (400ms, 2-char min)
- Uses existing `trpc.contentSearch.search` endpoint
- Results with type badges (page, blog, category, tag)
- Auto-focus input on open

**8. `BrokenLinksBanner.tsx` (`src/components/admin/BrokenLinksBanner.tsx`)**
Warning banner for broken internal links after save.

Props: `urls: string[], onDismiss`

Yellow warning banner listing broken URLs. Returns null if empty.

### C. RichTextEditor Enhancements

**9. Enhance `RichTextEditor.tsx`**

New props (additive, backward compatible):
```typescript
interface Props {
  content: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // NEW:
  postId?: number;
  height?: string;
  storageKey?: string;
  onRequestLinkPicker?: () => void;
  editorRef?: React.RefObject<EditorHandle | null>;
}
```

New `EditorHandle` interface (exported):
```typescript
export interface EditorHandle {
  replaceSelection: (text: string) => void;
}
```

New features:
- **Image upload**: toolbar button + paste/drop handlers → `POST /api/upload` with `postId` → insert `setImage({ src })`
- **Height persistence**: ResizeObserver + localStorage (`cms-editor-h:{storageKey}`)
- **Internal link button**: toolbar icon, calls `onRequestLinkPicker()`
- **EditorHandle**: `replaceSelection` parses `[title](url)` → inserts as Tiptap link node (WYSIWYG) or raw text at cursor (source mode)

### D. Utility Files

**10. `extractInternalLinks.ts` (`src/lib/extract-internal-links.ts`)**
Parse markdown link URLs, return deduplicated array of internal (relative) paths.

**11. `LOCALE_LABELS` constant (`src/lib/constants.ts`)**
Add `LOCALE_LABELS: Record<Locale, string>` — `{ en: 'English', es: 'Espa\u00f1ol', de: 'Deutsch' }`.

**12. Datetime utils (`src/lib/datetime.ts`)**
`convertUTCToLocal(date)` and `convertLocalToUTC(localStr)` for scheduled post datetime-local inputs.

### E. Backend Additions

**13. `cms.validateLinks` procedure (`src/server/routers/cms.ts`)**
Input: `{ urls: string[] }` (max 100). For each URL, try to resolve to a published CMS content item. Return `{ url, valid }[]`.

**14. Enhanced `duplicate` mutation for cross-language**
Current sweetcms `duplicate` appends `-copy`. For translation workflow, need a variant that:
- Accepts `targetLang` parameter
- Creates in target language with slug `{slug}-{lang}`
- Sets `translationGroup` (creates UUID if source has none, shares if it does)
- Navigates to new translation's edit page

This can be a new `duplicateAsTranslation` procedure or an enhanced `duplicate` with optional `targetLang`.

### F. Form Refactors

**15. PostForm.tsx refactor**
- Replace 16 individual `useState` calls with `useCmsFormState<PostFormData>`
- Extract inline SEO fields → `<SEOFields />`
- Add `<TranslationBar />` (edit mode, if translations exist in query response)
- Add `<FallbackRadio />` (edit mode)
- Add `<InternalLinkDialog />` + `useLinkPicker()`
- Add `<BrokenLinksBanner />` + `useLinkValidation()`
- Add image upload props to RichTextEditor (`postId`, `storageKey`, `editorRef`, `onRequestLinkPicker`)
- Smart back button: `history.length > 1 ? router.back() : router.push(list)`
- UTC/local datetime conversion for publishedAt

**16. CategoryForm.tsx refactor**
- Same `useCmsFormState<CategoryFormData>` refactor
- Extract SEO → `<SEOFields />`
- Add TranslationBar, FallbackRadio
- Add InternalLinkDialog + useLinkPicker
- Add BrokenLinksBanner + useLinkValidation
- RichTextEditor enhancements

**17. TermForm.tsx** — minimal changes only (no rich editor, no SEO, no translations). No refactor needed.

## Dependencies

No new packages needed. All Tiptap, turndown, marked packages already installed.

## What's NOT changing

- Public rendering pipeline (react-markdown, shortcodes)
- DB schema (translation fields already exist)
- tRPC router structure (additive only)
- TermForm internals (too simple to warrant refactor)
- Autosave system (already works)
- MediaPickerDialog (already exists)
- RevisionHistory (already exists)
- CmsFormShell (already fixed)

## Verification

1. `bun run typecheck` passes
2. Create new post → all fields work, image upload, link picker, save
3. Edit post → TranslationBar shows, can duplicate to other language
4. Toggle source mode → markdown preserved
5. Save → BrokenLinksBanner shows if broken links
6. SEOFields render in both PostForm and CategoryForm
7. FallbackRadio persists setting
8. Editor height persists across page loads
9. Smart back button: direct nav → goes to list, browser back → goes to previous page
