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
  projectFiles: [
    'config/payments-deps.ts',
    'app/dashboard/(panel)/settings/billing/page.tsx',
    'app/dashboard/(panel)/settings/billing/components/SubscriptionSummary.tsx',
    'app/dashboard/(panel)/settings/billing/components/SubscriptionsTable.tsx',
    'app/dashboard/(panel)/settings/billing/components/ChurnedSubscriptionsTable.tsx',
    'app/dashboard/(panel)/settings/billing/components/DiscountCodesTable.tsx',
    'app/dashboard/(panel)/settings/billing/components/RevenueChart.tsx',
    'app/dashboard/(panel)/settings/billing/components/RecentTransactionsTable.tsx',
    'app/dashboard/(panel)/settings/discount-codes/page.tsx',
    'app/(public)/account/billing/page.tsx',
    'app/(public)/pricing/page.tsx',
  ],
};

export default config;
