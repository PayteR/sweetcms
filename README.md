# sweetcms-engine

Shared CMS engine for [SweetCMS](https://github.com/PayteR/sweetcms). Provides reusable infrastructure: components, hooks, CRUD utilities, RBAC policy, design tokens, and type definitions.

This repo is consumed via `git subtree` in SweetCMS projects. You don't install it as a package.

## Usage

In a SweetCMS project:

```bash
# Add engine as subtree (first time)
git subtree add --prefix=src/engine git@github.com:PayteR/sweetcms-engine.git main --squash

# Pull engine updates
git subtree pull --prefix=src/engine git@github.com:PayteR/sweetcms-engine.git main --squash
```

## Structure

```
components/   — CmsFormShell, RichTextEditor, SEOFields, TagInput, MediaPickerDialog, etc.
config/       — ContentTypeDeclaration, TaxonomyDeclaration interfaces + factory helpers
crud/         — admin-crud, taxonomy-helpers, cms-helpers, content-revisions, slug-redirects
hooks/        — useCmsFormState, useCmsAutosave, useListViewState, useBulkActions, etc.
lib/          — slug, markdown, audit, webhooks
policy/       — Role, Policy, Capability, isSuperAdmin
store/        — preferences-store (Zustand)
styles/       — tokens.css (OKLCH design tokens), admin.css, admin-table.css, content.css
types/        — PostType, ContentStatus, FileType, ContentSnapshot
```

## License

MIT
