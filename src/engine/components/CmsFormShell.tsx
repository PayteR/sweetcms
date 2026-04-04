'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface CmsFormShellProps {
  toolbar: ReactNode;
  children: ReactNode;
}

export default function CmsFormShell({ toolbar, children }: CmsFormShellProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => { if (entry) setIsStuck(!entry.isIntersecting); },
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="form-shell">
      <div ref={sentinelRef} className="form-shell-sentinel h-0" />

      {/* Toolbar — full width background, centered content */}
      <div
        className={cn(
          'form-shell-toolbar sticky top-12 xl:top-0 z-30 transition-[background-color,border-color] duration-200',
          isStuck
            ? 'bg-(--surface-secondary) border-b border-b-(--border-primary)'
            : 'border-b border-transparent'
        )}
      >
        <div className="form-shell-toolbar-inner shell-inner-body h-14 flex items-center justify-between">
          {toolbar}
        </div>
      </div>

      {/* Body — centered, padded */}
      <div className="form-shell-body shell-inner-body space-y-6">
        {children}
      </div>
    </div>
  );
}
