import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.url(),

  // Auth
  BETTER_AUTH_SECRET: z.string().min(32),

  // Social providers (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),

  // Email (SMTP)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_EMAIL: z.email().optional(),

  // Redis
  REDIS_URL: z.url().optional(),
  REDIS_PASSWORD: z.string().optional(),

  // DeepL Translation (optional)
  DEEPL_API_KEY: z.string().optional(),
  DEEPL_API_FREE: z.coerce.boolean().default(true),

  // Storage
  STORAGE_BACKEND: z.enum(['s3', 'filesystem']).default('filesystem'),

  // Storage (S3-compatible) — required only when STORAGE_BACKEND=s3
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  NEXT_PUBLIC_CDN_URL: z.url().optional().or(z.literal('')),

  // Application
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1).default('SweetCMS'),

  // Admin registration
  NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED: z.coerce.boolean().default(false),

  // Customer registration
  NEXT_PUBLIC_REGISTRATION_ENABLED: z.coerce.boolean().default(true),

  // Stripe (optional — billing disabled without STRIPE_SECRET_KEY)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Stripe price IDs (optional — required per-plan when Stripe billing is enabled)
  STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STARTER_YEARLY: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ENTERPRISE_YEARLY: z.string().optional(),

  // Social login (public — optional, buttons hidden when absent)
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_DISCORD_CLIENT_ID: z.string().optional(),

  // NOWPayments (optional — crypto payments disabled without API key)
  NOWPAYMENTS_API_KEY: z.string().optional(),
  NOWPAYMENTS_IPN_SECRET: z.string().optional(),
  NOWPAYMENTS_SANDBOX: z.coerce.boolean().default(true),

  // Server role
  SERVER_ROLE: z.enum(['all', 'frontend', 'api', 'worker']).default('all'),
  PORT: z.string().regex(/^\d+$/).default('3000'),

  // WebSocket
  WS_ENABLED: z.coerce.boolean().default(true),

});

// Validate and export
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:');
  console.error(parsedEnv.error.format());
  throw new Error('Invalid environment variables');
}

export const env = parsedEnv.data;

export type Env = z.infer<typeof envSchema>;
