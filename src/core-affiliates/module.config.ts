import type { ModuleConfig } from '@/core/lib/module-config';

const config: ModuleConfig = {
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
};

export default config;
