'use client';

import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';

import { signOut, useSession } from '@/lib/auth-client';

function RoleBadge({ role }: { role: string }) {
  const classMap: Record<string, string> = {
    superadmin: 'admin-role-badge admin-role-superadmin',
    admin: 'admin-role-badge admin-role-admin',
    editor: 'admin-role-badge admin-role-editor',
    user: 'admin-role-badge admin-role-user',
  };

  return (
    <span className={classMap[role] ?? classMap.user}>
      {role}
    </span>
  );
}

export function AdminHeader() {
  const router = useRouter();
  const { data: session } = useSession();

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        {session?.user && (
          <span className="flex items-center gap-2 text-sm text-gray-600">
            <User className="h-4 w-4" />
            {session.user.name ?? session.user.email}
            {userRole && <RoleBadge role={userRole} />}
          </span>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </header>
  );
}
