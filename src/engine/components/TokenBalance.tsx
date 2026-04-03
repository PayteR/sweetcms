'use client';

import { useState, useRef, useEffect } from 'react';
import { Coins } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useBlankTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';
import { useChannel } from '@/engine/lib/ws-client';

interface TokenBalanceProps {
  /** Active organization ID — required for WS channel subscription */
  orgId?: string;
  /** Where clicking the badge navigates */
  href?: string;
}

interface TokenWsPayload {
  balance: number;
  orgId: string;
  timestamp: string;
}

export function TokenBalance({ orgId, href }: TokenBalanceProps) {
  const __ = useBlankTranslations();
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const prevBalance = useRef<number | null>(null);

  const { data } = trpc.billing.getTokenBalance.useQuery(undefined, {
    enabled: !!orgId,
  });

  // ws-client delivers msg.payload directly — duck-type check for balance field
  useChannel<Partial<TokenWsPayload>>(
    orgId ? `org:${orgId}` : '',
    (msg) => {
      if (typeof msg?.balance === 'number') {
        setLiveBalance(msg.balance);
      }
    },
  );

  const balance = liveBalance ?? data?.balance ?? 0;

  useEffect(() => {
    if (prevBalance.current !== null && balance !== prevBalance.current) {
      setAnimating(true);
      const timer = setTimeout(() => setAnimating(false), 600);
      return () => clearTimeout(timer);
    }
    prevBalance.current = balance;
  }, [balance]);

  if (!orgId) return null;

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
