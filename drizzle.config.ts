import type { Config } from 'drizzle-kit';

export default {
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  tablesFilter: ['cms_*', 'saas_*', 'user', 'session', 'account', 'verification', 'organization', 'member', 'invitation'],
} satisfies Config;
