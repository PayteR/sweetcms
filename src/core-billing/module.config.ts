import type { ModuleConfig } from '@/core/lib/module-config';

const config: ModuleConfig = {
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
};

export default config;
