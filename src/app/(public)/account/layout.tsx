import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { AccountSidebar } from '@/components/public/AccountSidebar';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login?callbackUrl=/account');
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex flex-col md:flex-row gap-8">
        <AccountSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
