import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { TRPCProvider } from '@/lib/trpc/provider';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SweetCMS',
  description: 'Agent-driven headless CMS for T3 Stack',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var p=location.pathname;var k=p.startsWith('/dashboard')?'sweetcms-theme-admin':'sweetcms-theme-public';var t=localStorage.getItem(k)||localStorage.getItem('sweetcms-theme');var d=t==='dark'||(t==='system')&&matchMedia('(prefers-color-scheme:dark)').matches;if(d)document.documentElement.classList.add('dark')})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
