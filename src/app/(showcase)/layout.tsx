import '@/engine/styles/tokens-public.css';
import '@/engine/styles/content.css';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { siteConfig } from '@/config/site';
import { ThemeToggle } from '@/engine/components/ThemeToggle';
import { getLocale } from '@/lib/locale-server';
import { localePath } from '@/lib/locale';

export default async function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <>
      {/* Minimal floating nav — back button + site name */}
      <div className="fixed left-4 top-4 z-30 flex items-center gap-2 sm:left-6 sm:top-6">
        <Link
          href={localePath('/', locale)}
          className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:bg-black/50"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{siteConfig.name}</span>
        </Link>
        <div className="rounded-full bg-black/30 backdrop-blur-md">
          <ThemeToggle />
        </div>
      </div>
      {children}
    </>
  );
}
