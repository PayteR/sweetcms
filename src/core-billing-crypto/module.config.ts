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
};

export default config;
