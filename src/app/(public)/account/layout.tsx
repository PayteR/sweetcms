import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { User, Settings, Shield, CreditCard, LifeBuoy, Link2 } from 'lucide-react';
import { auth } from '@/lib/auth';
import { AccountSidebar } from '@/engine/components/AccountSidebar';
import { publicAuthRoutes, accountRoutes } from '@/config/routes';

const ACCOUNT_NAV_ITEMS = [
  { href: accountRoutes.home, label: 'Overview', icon: User, exact: true },
  { href: accountRoutes.settings, label: 'Settings', icon: Settings },
  { href: accountRoutes.security, label: 'Security', icon: Shield },
  { href: accountRoutes.billing, label: 'Billing', icon: CreditCard },
  { href: accountRoutes.support, label: 'Support', icon: LifeBuoy },
  { href: accountRoutes.affiliates, label: 'Affiliates', icon: Link2 },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`${publicAuthRoutes.login}?callbackUrl=${accountRoutes.home}`);
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex flex-col md:flex-row gap-8">
        <AccountSidebar navItems={ACCOUNT_NAV_ITEMS} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
