'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useBlankTranslations } from '@/lib/translations';
import { useOverlay } from '@/engine/hooks/useOverlay';

const widthClasses = {
  sm: 'max-w-[384px]',
  md: 'max-w-[512px]',
  lg: 'max-w-[640px]',
  xl: 'max-w-[768px]',
} as const;

export type SlideOverWidth = keyof typeof widthClasses;

export interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: SlideOverWidth;
  className?: string;
  children: ReactNode;
}

export function SlideOver({
  open,
  onClose,
  title,
  width = 'md',
  className,
  children,
}: SlideOverProps) {
  const __ = useBlankTranslations();
  const { panelRef, animateOpen } = useOverlay({ open, onClose });

  return (
    <div
      className={cn('admin-slide-over', animateOpen && 'admin-slide-over-open')}
      role="dialog"
      aria-modal={open || undefined}
      inert={!open || undefined}
    >
      <div
        className="admin-slide-over-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={cn('admin-slide-over-panel', widthClasses[width], className)}
      >
        {/* Header */}
        <div className="admin-slide-over-header flex items-center justify-between border-b border-(--border-secondary) px-5 py-4">
          <h2 className="admin-h2">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-(--text-muted) hover:bg-(--surface-inset) hover:text-(--text-primary)"
            title={__('Close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="admin-slide-over-body flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
