import { Metadata } from 'next';
import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Set a new password',
};

export default function ResetPasswordPage() {
  return (
    <main className="container mx-auto px-4 py-16 max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Reset Password</h1>
        <p className="text-(--text-secondary) mt-2">Enter your new password below.</p>
      </div>
      <ResetPasswordForm />
    </main>
  );
}
