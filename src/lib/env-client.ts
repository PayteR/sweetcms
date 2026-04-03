import { z } from 'zod';

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().min(1),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1).default('SweetCMS'),
  NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED: z.coerce.boolean().default(false),
  NEXT_PUBLIC_REGISTRATION_ENABLED: z.coerce.boolean().default(true),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_DISCORD_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_CDN_URL: z.string().optional().or(z.literal('')),
});

// On the client, NEXT_PUBLIC_* vars are inlined at build time via process.env
// We must reference them explicitly for Next.js to inline them
const clientEnvRaw = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED: process.env.NEXT_PUBLIC_ADMIN_REGISTRATION_ENABLED,
  NEXT_PUBLIC_REGISTRATION_ENABLED: process.env.NEXT_PUBLIC_REGISTRATION_ENABLED,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_DISCORD_CLIENT_ID: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
  NEXT_PUBLIC_CDN_URL: process.env.NEXT_PUBLIC_CDN_URL,
};

const parsed = clientEnvSchema.safeParse(clientEnvRaw);

if (!parsed.success) {
  console.error('Invalid client environment variables:', parsed.error.format());
  throw new Error('Invalid client environment variables');
}

export const clientEnv = parsed.data;
