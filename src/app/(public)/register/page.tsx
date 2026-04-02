import Link from 'next/link';

export default function CustomerRegisterPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-(--text-primary)">Customer Registration</h1>
        <p className="mt-3 text-sm text-(--text-secondary)">
          Customer registration is coming soon.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-(--color-brand-600) hover:text-(--color-brand-500)"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
