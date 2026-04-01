'use client';

import { createContext, useContext, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useBlankTranslations } from '@/lib/translations';
import { useOverlay } from '@/engine/hooks/useOverlay';

/* ── Size presets ── */

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

/* ── Visual class names (overridable per variant) ── */

export interface DialogClassNames {
  panel?: string;
  header?: string;
  body?: string;
  footer?: string;
}

const ADMIN_CLASSES: Required<DialogClassNames> = {
  panel: 'admin-dialog-panel',
  header: 'admin-dialog-header',
  body: 'admin-dialog-body',
  footer: 'admin-dialog-footer',
};

const DialogClassContext = createContext<Required<DialogClassNames>>(ADMIN_CLASSES);

/* ── Root ── */

export interface DialogProps {
  /** Controls visibility and overlay behavior */
  open: boolean;
  /** Called when the dialog requests close (Escape, backdrop click) */
  onClose: () => void;
  /** Panel max-width preset (default: 'md') */
  size?: DialogSize;
  /** Additional CSS classes on the panel */
  className?: string;
  /** Override visual class names for non-admin contexts (e.g. frontend) */
  classNames?: DialogClassNames;
  /** Close when clicking the backdrop (default: true) */
  closeOnBackdropClick?: boolean;
  /** Close on Escape key (default: true) */
  closeOnEscape?: boolean;
  /** Auto-focus first focusable element when opened (default: true) */
  autoFocus?: boolean;
  /** Specific element to receive initial focus */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

function DialogRoot({
  open,
  onClose,
  size = 'md',
  className,
  classNames,
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

  const resolved = classNames
    ? { ...ADMIN_CLASSES, ...classNames }
    : ADMIN_CLASSES;

  return (
    <DialogClassContext.Provider value={resolved}>
      <div
        className={cn('overlay-dialog', animateOpen && 'overlay-dialog-open')}
        role="dialog"
        aria-modal={open || undefined}
        inert={!open || undefined}
      >
        <div
          className="overlay-backdrop"
          onClick={closeOnBackdropClick ? onClose : undefined}
          aria-hidden="true"
        />
        <div
          ref={panelRef}
          className={cn(
            'overlay-dialog-panel',
            resolved.panel,
            sizeClasses[size],
            className,
          )}
        >
          {children}
        </div>
      </div>
    </DialogClassContext.Provider>
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
  const classes = useContext(DialogClassContext);
  return (
    <div className={cn('overlay-dialog-header', classes.header, className)}>
      <h3 className="overlay-title">{children}</h3>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="overlay-close-btn"
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
  const classes = useContext(DialogClassContext);
  return (
    <div className={cn('overlay-dialog-body', classes.body, className)}>
      {children}
    </div>
  );
}

export interface DialogFooterProps {
  children: ReactNode;
  className?: string;
}

function Footer({ children, className }: DialogFooterProps) {
  const classes = useContext(DialogClassContext);
  return (
    <div className={cn('overlay-dialog-footer', classes.footer, className)}>
      {children}
    </div>
  );
}

/* ── Export as compound component ── */

export const Dialog = Object.assign(DialogRoot, {
  Header,
  Body,
  Footer,
});
