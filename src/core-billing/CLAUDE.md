# core-billing — CLAUDE.md

Free billing module. Multi-provider payment system with subscriptions, tokens, discounts, and dunning.

## Module Boundary

**core-billing owns:** Billing schema (7 tables), billing/discount-codes routers, Stripe provider, subscription/discount/token/feature-gate services, factory/registry, dunning job, payment+billing types.

**Project owns:** Plan definitions (`config/plans.ts`), provider configs (`config/payment-providers.ts`), billing admin pages, webhook routes (`app/api/webhooks/`), dependency wiring (`config/payments-deps.ts`).

## Import Rules

- core-billing imports from `@/core/*` (core utilities)
- Framework conventions imported directly: `@/server/trpc`, `@/server/db`, `@/server/db/schema/auth`, `@/server/db/schema/organization`, `@/server/db/schema/audit`
- Project-specific behavior injected via `setPaymentsDeps()`
- Project imports from `@/core-billing/*`
- Core (`src/core/`) never imports from core-billing

## Dependency Injection

`deps.ts` defines `PaymentsDeps`. Project calls `setPaymentsDeps()` at startup. Injected deps:

- **getPlans / getPlan / getPlanByProviderPriceId / getProviderPriceId** — plan definitions
- **getEnabledProviderConfigs** — which payment providers are enabled
- **resolveOrgId** — resolve active org for a user
- **sendOrgNotification** — notify org members
- **enqueueTemplateEmail** — send dunning/lifecycle emails
- **broadcastEvent** — WS broadcast (token balance updates)

## Wiring Into a Project

1. **Deps:** Create `config/payments-deps.ts` calling `setPaymentsDeps()`, import in `server.ts`
2. **Routers:** Import `billingRouter` + `discountCodesRouter` in `_app.ts`
3. **Schema:** Re-export billing tables from `schema/index.ts`
4. **Plans:** Define plans in `config/plans.ts`, call `setPlanResolver()` for feature-gate
5. **Providers:** Configure in `config/payment-providers.ts`
6. **Dunning:** Import in `server.ts` job setup
7. **Webhooks:** Keep in `app/api/webhooks/` (Next.js routing requirement)

## Provider Registry

Providers register via `registerPaymentProvider(id, factory)`. Stripe is built-in. Additional providers (e.g., `core-billing-crypto`) register via their own `register.ts` side-effect import.
