import { Metadata } from 'next';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create a new account',
};

export default function RegisterPage() {
  const registrationEnabled = process.env.NEXT_PUBLIC_REGISTRATION_ENABLED !== 'false';

  if (!registrationEnabled) {
    return (
      <main className="container mx-auto px-4 py-16 max-w-md text-center">
        <h1 className="text-3xl font-bold mb-4">Registration Closed</h1>
        <p className="text-(--text-secondary)">Registration is currently not available. Please contact us for access.</p>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-16 max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Create Account</h1>
        <p className="text-(--text-secondary) mt-2">Start your journey with a free account.</p>
      </div>
      <RegisterForm />
    </main>
  );
}
