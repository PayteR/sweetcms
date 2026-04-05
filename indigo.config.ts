/**
 * Indigo module configuration.
 *
 * Declares which modules are installed. Run `bun run indigo:sync` after editing
 * to regenerate glue files (routers, schema, server init, components).
 *
 * Each module entry defines:
 * - routers: tRPC router imports to add to _app.ts
 * - schema: schema re-exports for Drizzle discovery
 * - serverInit: side-effect imports for deps/registration (executed in server.ts)
 * - jobs: background worker imports (started in server.ts when workers enabled)
 * - layoutWidgets: components injected into public layout
 */

import type { ModuleConfig } from '@/core/lib/module-config';

const modules: ModuleConfig[] = [
  {
    id: 'core-billing',
    routers: [
      { name: 'billingRouter', key: 'billing', from: '@/core-billing/routers/billing' },
      { name: 'discountCodesRouter', key: 'discountCodes', from: '@/core-billing/routers/discount-codes' },
    ],
    schema: [
      '@/core-billing/schema/billing',
    ],
    serverInit: [
      '@/config/payments-deps',
    ],
    jobs: [],
    layoutWidgets: [],
  },
  {
    id: 'core-billing-crypto',
    routers: [],
    schema: [],
    serverInit: [
      '@/core-billing-crypto/register',
    ],
    jobs: [],
    layoutWidgets: [],
  },
  {
    id: 'core-support',
    routers: [
      { name: 'supportChatRouter', key: 'supportChat', from: '@/core-support/routers/support-chat' },
      { name: 'supportRouter', key: 'support', from: '@/core-support/routers/support' },
    ],
    schema: [
      '@/core-support/schema/support-chat',
      '@/core-support/schema/support-tickets',
    ],
    serverInit: [
      '@/config/support-deps',
    ],
    jobs: [
      { name: 'startSupportChatCleanupWorker', from: '@/core-support/jobs/support-chat' },
    ],
    layoutWidgets: [
      { name: 'SupportChatWidgetWrapper', from: '@/components/public/SupportChatWidgetWrapper' },
    ],
  },
  {
    id: 'core-affiliates',
    routers: [
      { name: 'affiliatesRouter', key: 'affiliates', from: '@/core-affiliates/routers/affiliates' },
      { name: 'attributionsRouter', key: 'attributions', from: '@/core-affiliates/routers/attributions' },
    ],
    schema: [
      '@/core-affiliates/schema/affiliates',
      '@/core-affiliates/schema/attributions',
    ],
    serverInit: [
      '@/config/affiliates-deps',
    ],
    jobs: [],
    layoutWidgets: [
      { name: 'AttributionCapture', from: '@/core-affiliates/components/AttributionCapture' },
    ],
  },
];

export default modules;
