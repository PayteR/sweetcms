'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/engine/components/Dialog';
import { useAuthDialogStore } from '@/store/auth-dialog-store';
import { LoginForm } from '@/app/(public)/login/LoginForm';
import { RegisterForm } from '@/app/(public)/register/RegisterForm';

function LoginDialogInner() {
  const router = useRouter();
  const { showLoginDialog, closeDialog, openRegisterDialog } = useAuthDialogStore();

  const handleSuccess = () => {
    closeDialog();
    router.refresh();
  };

  return (
    <Dialog open={showLoginDialog} onClose={closeDialog} size="sm" zoomFromClick >
      <Dialog.Header onClose={closeDialog}>Sign In</Dialog.Header>
      <Dialog.Body>
        <Suspense fallback={null}>
          <LoginForm onSuccess={handleSuccess} onSwitchToRegister={openRegisterDialog} />
        </Suspense>
      </Dialog.Body>
    </Dialog>
  );
}

function RegisterDialogInner() {
  const router = useRouter();
  const { showRegisterDialog, closeDialog, openLoginDialog } = useAuthDialogStore();

  const registrationEnabled = process.env.NEXT_PUBLIC_REGISTRATION_ENABLED !== 'false';

  const handleSuccess = () => {
    closeDialog();
    router.refresh();
  };

  return (
    <Dialog open={showRegisterDialog} onClose={closeDialog} size="sm" zoomFromClick >
      <Dialog.Header onClose={closeDialog}>Create Account</Dialog.Header>
      <Dialog.Body>
        {registrationEnabled ? (
          <Suspense fallback={null}>
            <RegisterForm onSuccess={handleSuccess} onSwitchToLogin={openLoginDialog} />
          </Suspense>
        ) : (
          <p className="text-(--text-secondary) text-sm">
            Registration is currently not available. Please contact us for access.
          </p>
        )}
      </Dialog.Body>
    </Dialog>
  );
}

export function AuthDialogs() {
  return (
    <>
      <LoginDialogInner />
      <RegisterDialogInner />
    </>
  );
}
