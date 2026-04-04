'use client';

import { useState, useRef, useEffect } from 'react';
import { Coins } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAdminTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';
import { useChannel } from '@/engine/lib/ws-client';

interface TokenBalanceProps {
  /** Where clicking the badge navigates */
  href?: string;
}

interface TokenWsPayload {
  balance: number;
  orgId: string;
  timestamp: string;
}

export function TokenBalance({ href }: TokenBalanceProps) {
  const __ = useAdminTranslations();
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const prevBalance = useRef<number | null>(null);

  // Server resolves the org via resolveOrgId — no orgId prop needed
  const { data } = trpc.billing.getTokenBalance.useQuery();

  // Subscribe to WS using the orgId returned from the query
  const resolvedOrgId = data?.orgId;

  useChannel<Partial<TokenWsPayload>>(
    resolvedOrgId ? `org:${resolvedOrgId}` : '',
    (msg) => {
      if (typeof msg?.balance === 'number') {
        setLiveBalance(msg.balance);
      }
    },
  );

  const balance = liveBalance ?? data?.balance ?? 0;

  useEffect(() => {
    if (prevBalance.current !== null && balance !== prevBalance.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- trigger animation on balance change
      setAnimating(true);
      const timer = setTimeout(() => setAnimating(false), 600);
      return () => clearTimeout(timer);
    }
    prevBalance.current = balance;
  }, [balance]);

  // Don't render until we have data (avoids flash of 0)
  if (!data) return null;

  const content = (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium',
        'bg-(--surface-secondary) hover:bg-(--surface-elevated)',
        'cursor-pointer transition-all duration-300',
        animating && 'scale-110',
      )}
      title={__('Token balance')}
    >
      <Coins className="h-4 w-4 text-amber-500" />
      <span className="tabular-nums">{balance.toLocaleString()}</span>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}
