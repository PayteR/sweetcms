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
    <div className="form-shell -mx-6 -mt-6">
      <div ref={sentinelRef} className="form-shell-sentinel h-0" />
      <div
        className={cn(
          'form-shell-toolbar sticky top-12 xl:top-0 z-30 transition-[background-color,border-color] duration-200',
          isStuck
            ? 'bg-(--surface-primary) border-b border-b-(--border-primary)'
            : 'border-b border-transparent'
        )}
      >
        <div className="form-shell-toolbar-inner mx-auto max-w-300 px-8 h-14 flex items-center justify-between">
          {toolbar}
        </div>
      </div>

      <div className="form-shell-body mx-auto max-w-300 px-8 pb-8 pt-6 space-y-6">
        {children}
      </div>
    </div>
  );
}
