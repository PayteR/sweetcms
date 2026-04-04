# App Routes — CLAUDE.md

## i18n / Locale Routing

**Approach:** Proxy-rewrite with locale prefix — no `[locale]` route segment. Default locale (`en`) has no prefix; non-default locales get prefix (`/de/blog/post`). Dashboard is unaffected.

**How it works:** `src/proxy.ts` detects locale prefix, rewrites URL (strips prefix), sets `x-locale` header.

**Key rules:**
- All public `<Link>` hrefs must use `localePath()` (server) or `<LocaleLink>` (client)
- All public queries must pass `lang: locale` (from `getLocale()` or `useLocale()`)
- hreflang alternates use `translationGroup` DB column for sibling lookup

**Tradeoff:** `x-locale` header via `headers()` makes all public pages dynamic (no ISR/SSG). Acceptable for DB-driven CMS. For static generation in single-locale deployments, set `LOCALES` to one entry.

**To add a locale:** Add to `LOCALES` + `LOCALE_LABELS` in `src/lib/constants.ts`. Optionally add DeepL mapping. No other code changes.

## Catch-All Route (`[...slug]`)

Uses **renderer registry** pattern (open-closed): `renderer-registry.ts` + `register-renderers.tsx`. Adding a content type = registering a renderer, no if/else chains.

Supports preview mode via `?preview=<token>`.

## Auth Proxy Rules

`src/proxy.ts`: Dashboard auth paths (`/dashboard/login`, etc.) allowed without session. All other `/dashboard/*` paths redirect to `/dashboard/login`. `/account` paths require session (redirect to `/login`).

## PostForm Panel System

Form panels (SEO, Categories, Tags, Featured Image, etc.) are reorderable via dnd-kit and hideable via config SlideOver. Panels draggable between main/sidebar columns. Panel definitions in `src/config/post-form-panels.ts`. Order/visibility persisted via user preferences.
