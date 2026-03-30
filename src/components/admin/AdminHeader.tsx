'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Menu, Monitor, Moon, Sun, User } from 'lucide-react';

import { signOut, useSession } from '@/lib/auth-client';
import { useThemeStore } from '@/store/theme-store';
import { useSidebarStore } from '@/store/sidebar-store';

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

const themeOrder = ['light', 'dark', 'system'] as const;
const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;
const themeLabels = { light: 'Light', dark: 'Dark', system: 'System' } as const;

export function AdminHeader() {
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, setTheme, initTheme } = useThemeStore();
  const toggleSidebar = useSidebarStore((s) => s.toggleSidebar);

  useEffect(() => {
    return initTheme();
  }, [initTheme]);

  function cycleTheme() {
    const idx = themeOrder.indexOf(theme);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setTheme(next);
  }

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  const userRole = (session?.user as Record<string, unknown> | undefined)?.role as string | undefined;
  const ThemeIcon = themeIcons[theme];

  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-(--border-primary) bg-(--surface-primary) px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary) xl:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/dashboard" className="text-lg font-bold text-(--text-primary)">
          SweetCMS
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={cycleTheme}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary)"
          title={`Theme: ${themeLabels[theme]}`}
        >
          <ThemeIcon className="h-4 w-4" />
        </button>
        {session?.user && (
          <span className="flex items-center gap-2 text-sm text-(--text-secondary)">
            <User className="h-4 w-4" />
            {session.user.name ?? session.user.email}
            {userRole && <RoleBadge role={userRole} />}
          </span>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-primary)"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </header>
  );
}
