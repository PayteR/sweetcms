'use client';

import type { ReactNode } from 'react';

interface CmsFormShellProps {
  toolbar: ReactNode;
  children: ReactNode;
}

export default function CmsFormShell({ toolbar, children }: CmsFormShellProps) {
  return (
    <>
      <header className="page-header">
        <div className="page-toolbar">
          {toolbar}
        </div>
      </header>

      <main className="page-main">
        <div className="page-inner">
          {children}
        </div>
      </main>
    </>
  );
}
