'use client';

import type { ReactNode, RefObject } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useBlankTranslations } from '@/lib/translations';
import { useOverlay } from '@/engine/hooks/useOverlay';

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
} as const;

export type DialogSize = keyof typeof sizeClasses;

export interface DialogProps {
  /** Controls visibility and overlay behavior */
  open: boolean;
  /** Called when the dialog requests close (Escape, backdrop click) */
  onClose: () => void;
  /** Panel max-width preset (default: 'md') */
  size?: DialogSize;
  /** Additional CSS classes on the panel */
  className?: string;
  /** Close when clicking the backdrop (default: true) */
  closeOnBackdropClick?: boolean;
  /** Close on Escape key (default: true) */
  closeOnEscape?: boolean;
  /** Auto-focus first focusable element when opened (default: true) */
  autoFocus?: boolean;
  /** Specific element to receive initial focus (overrides first-focusable default) */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

function DialogRoot({
  open,
  onClose,
  size = 'md',
  className,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  autoFocus = true,
  initialFocusRef,
  children,
}: DialogProps) {
  const { panelRef, animateOpen } = useOverlay({
    open,
    onClose,
    closeOnEscape,
    autoFocus,
    initialFocusRef,
  });

  return (
    <div
      className={cn('admin-dialog', animateOpen && 'admin-dialog-open')}
      role="dialog"
      aria-modal={open || undefined}
      inert={!open || undefined}
    >
      <div
        className="admin-dialog-backdrop"
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={cn('admin-dialog-panel', sizeClasses[size], className)}
      >
        {children}
      </div>
    </div>
  );
}

/* ── Compound sub-components ── */

export interface DialogHeaderProps {
  children: ReactNode;
  /** Show close (X) button — pass the onClose handler */
  onClose?: () => void;
  className?: string;
}

function Header({ children, onClose, className }: DialogHeaderProps) {
  const __ = useBlankTranslations();
  return (
    <div className={cn('admin-dialog-header', className)}>
      <h3 className="admin-h2">{children}</h3>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-(--text-muted) hover:bg-(--surface-inset) hover:text-(--text-primary)"
          title={__('Close')}
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

export interface DialogBodyProps {
  children: ReactNode;
  className?: string;
}

function Body({ children, className }: DialogBodyProps) {
  return <div className={cn('admin-dialog-body', className)}>{children}</div>;
}

export interface DialogFooterProps {
  children: ReactNode;
  className?: string;
}

function Footer({ children, className }: DialogFooterProps) {
  return <div className={cn('admin-dialog-footer', className)}>{children}</div>;
}

/* ── Export as compound component ── */

export const Dialog = Object.assign(DialogRoot, {
  Header,
  Body,
  Footer,
});
