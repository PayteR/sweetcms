'use client';

import type { ReactNode } from 'react';

interface CmsFormShellProps {
  toolbar: ReactNode;
  children: ReactNode;
}

export default function CmsFormShell({ toolbar, children }: CmsFormShellProps) {
  return (
    <div className="form">
      {/* Toolbar — full width background, centered content.
          Uses scroll-driven animation to fade in background when stuck. */}
      <div className="form-toolbar sticky top-12 xl:top-0 z-30">
        <div className="form-toolbar-inner shell-inner-body h-14 flex items-center justify-between">
          {toolbar}
        </div>
      </div>

      {/* Body — centered, padded */}
      <div className="form-body shell-inner-body space-y-6">
        {children}
      </div>
    </div>
  );
}
