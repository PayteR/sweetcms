import type { ModuleConfig } from '@/core/lib/module-config';

const config: ModuleConfig = {
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
};

export default config;
