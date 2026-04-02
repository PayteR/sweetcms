'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Settings, Shield, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/account', label: 'Overview', icon: User, exact: true },
  { href: '/account/settings', label: 'Settings', icon: Settings },
  { href: '/account/security', label: 'Security', icon: Shield },
  { href: '/account/billing', label: 'Billing', icon: CreditCard },
];

export function AccountSidebar() {
  const pathname = usePathname();

  return (
    <nav className="account-sidebar w-full md:w-56 shrink-0">
      <ul className="space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  'account-sidebar-link flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  active
                    ? 'bg-(--color-brand-500)/10 text-(--color-brand-500) font-medium'
                    : 'text-(--text-secondary) hover:bg-(--surface-secondary)'
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
