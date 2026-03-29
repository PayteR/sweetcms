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
    <div className="-mx-6 -mt-6">
      <div ref={sentinelRef} className="h-0" />
      <div
        className={cn(
          'sticky top-0 z-50 transition-[background-color,border-color] duration-200',
          isStuck
            ? 'bg-(--surface-primary) border-b border-b-(--border-primary) border-t-2 border-t-transparent'
            : 'border-b border-transparent'
        )}
      >
        <div className="mx-auto max-w-300 px-8 py-3 flex items-center justify-between">
          {toolbar}
        </div>
      </div>

      <div className="mx-auto max-w-300 px-8 pb-8 pt-6 space-y-6">
        {children}
      </div>
    </div>
  );
}
