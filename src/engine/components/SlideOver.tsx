'use client';

import { useLayoutEffect, useEffect, useRef } from 'react';
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Scroll lock with scrollbar compensation
  useEffect(() => {
    if (!open) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.paddingRight = '';
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="admin-slide-over"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
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
    </dialog>
  );
}
