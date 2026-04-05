import type { ModuleConfig } from '@/core/lib/module-config';

const config: ModuleConfig = {
  id: 'core-billing-crypto',
  routers: [],
  schema: [],
  serverInit: [
    '@/core-billing-crypto/register',
  ],
  jobs: [],
  layoutWidgets: [],
  projectFiles: [
    'app/api/webhooks/nowpayments/route.ts',
    'app/api/webhooks/nowpayments/__tests__/route.test.ts',
  ],
};

export default config;
