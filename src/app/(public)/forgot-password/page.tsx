import { Metadata } from 'next';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Forgot Password',
  description: 'Reset your password',
};

export default function ForgotPasswordPage() {
  return (
    <main className="container mx-auto px-4 py-16 max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Forgot Password</h1>
        <p className="text-(--text-secondary) mt-2">Enter your email to receive a reset link.</p>
      </div>
      <ForgotPasswordForm />
    </main>
  );
}
