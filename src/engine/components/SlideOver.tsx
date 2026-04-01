'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useBlankTranslations } from '@/lib/translations';

const widthClasses = {
  sm: 'max-w-[384px]',
  md: 'max-w-[512px]',
  lg: 'max-w-[640px]',
  xl: 'max-w-[768px]',
} as const;

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: keyof typeof widthClasses;
  children: React.ReactNode;
}

export function SlideOver({
  open,
  onClose,
  title,
  width = 'md',
  children,
}: SlideOverProps) {
  const __ = useBlankTranslations();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <div
      className={cn('admin-slide-over', open && 'admin-slide-over-open')}
      role="dialog"
      aria-modal={open ? 'true' : undefined}
      inert={!open ? true : undefined}
    >
      <div
        className="admin-slide-over-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={cn('admin-slide-over-panel', widthClasses[width])}>
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
