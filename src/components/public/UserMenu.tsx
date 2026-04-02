'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from '@/lib/auth-client';
import { User, Settings, Shield, CreditCard, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { publicAuthRoutes, accountRoutes } from '@/config/routes';

export function UserMenu() {
  const { data: session, isPending } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isPending) return null;

  if (!session?.user) {
    return (
      <Link
        href={publicAuthRoutes.login}
        className="text-sm font-medium text-(--color-brand-500) hover:underline"
      >
        Sign In
      </Link>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  const userImage = (session.user as { image?: string | null }).image;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 p-1.5 rounded-lg hover:bg-(--surface-secondary) transition-colors'
        )}
      >
        {userImage ? (
          <img
            src={userImage}
            alt=""
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-(--color-brand-500) flex items-center justify-center text-white text-sm font-medium">
            {(session.user.name?.[0] ?? (session.user.email as string)?.[0] ?? '?').toUpperCase()}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-(--border-primary) bg-(--surface-primary) shadow-lg z-50 py-1">
          <div className="px-3 py-2 border-b border-(--border-primary)">
            <p className="text-sm font-medium truncate">{session.user.name}</p>
            <p className="text-xs text-(--text-secondary) truncate">{session.user.email as string}</p>
          </div>

          <Link
            href={accountRoutes.home}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-(--surface-secondary) transition-colors"
            onClick={() => setOpen(false)}
          >
            <User size={16} />
            Account
          </Link>
          <Link
            href={accountRoutes.settings}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-(--surface-secondary) transition-colors"
            onClick={() => setOpen(false)}
          >
            <Settings size={16} />
            Settings
          </Link>
          <Link
            href={accountRoutes.security}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-(--surface-secondary) transition-colors"
            onClick={() => setOpen(false)}
          >
            <Shield size={16} />
            Security
          </Link>
          <Link
            href={accountRoutes.billing}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-(--surface-secondary) transition-colors"
            onClick={() => setOpen(false)}
          >
            <CreditCard size={16} />
            Billing
          </Link>

          <div className="border-t border-(--border-primary) mt-1 pt-1">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left text-(--color-danger-500) hover:bg-(--surface-secondary) transition-colors"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
