import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, customSession } from 'better-auth/plugins';
import { role } from 'better-auth/plugins/access';

import { Role } from '@/lib/policy';
import { db } from '@/server/db';
import { enqueueEmail } from '@/server/jobs/email';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),

  user: {
    modelName: 'user',
    fields: { name: 'name', emailVerified: 'emailVerified' },
  },
  session: {
    modelName: 'session',
    expiresIn: 60 * 60 * 24 * 365, // 1 year
    updateAge: 60 * 60 * 24 * 30, // refresh monthly
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 min
    },
  },
  account: {
    modelName: 'account',
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'discord'],
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await enqueueEmail({
        to: user.email,
        subject: 'Reset your password — SweetCMS',
        html: `<p>Hi ${user.name ?? 'there'},</p>
<p>Click the link below to reset your password:</p>
<p><a href="${url}">${url}</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>
<p>— SweetCMS</p>`,
      });
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      enabled: !!process.env.GOOGLE_CLIENT_ID,
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? '',
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
      enabled: !!process.env.DISCORD_CLIENT_ID,
    },
  },

  plugins: [
    admin({
      defaultRole: Role.USER,
      adminRoles: [Role.ADMIN, Role.SUPERADMIN],
      roles: {
        [Role.USER]: role({}),
        [Role.EDITOR]: role({}),
        [Role.ADMIN]: role({}),
        [Role.SUPERADMIN]: role({}),
      },
    }),
    customSession(async ({ user, session }) => {
      return {
        user: {
          ...user,
          role: (user as Record<string, unknown>).role as string ?? Role.USER,
          banned: (user as Record<string, unknown>).banned as boolean ?? false,
        },
        session,
      };
    }),
  ],

  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
  },

  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

export type Auth = typeof auth;
