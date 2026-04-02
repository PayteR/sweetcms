/** Site configuration — branding and defaults */

export const siteDefaults = {
  siteName: 'SweetCMS',
  siteUrl: 'http://localhost:3000',
  contactEmail: 'admin@sweetcms.dev',
} as const;

export const clientEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? siteDefaults.siteUrl,
  siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? siteDefaults.siteName,
} as const;

export const siteConfig = {
  name: clientEnv.siteName,
  description: 'AI Agent-driven T3 SaaS starter with integrated CMS',
  url: clientEnv.appUrl,

  seo: {
    title: `${clientEnv.siteName} — AI Agent-driven T3 SaaS Starter`,
    description:
      'Open-source SaaS starter kit with integrated CMS, built on Next.js, tRPC, Drizzle, and Better Auth. Multi-tenancy, Stripe billing, real-time WebSocket, and more.',
  },
} as const;
