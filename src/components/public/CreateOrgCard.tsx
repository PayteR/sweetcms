'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

export function CreateOrgCard() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const createOrg = trpc.organizations.create.useMutation();
  const setActive = trpc.organizations.setActive.useMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = name.trim();
    if (!trimmed) return;

    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    try {
      const org = await createOrg.mutateAsync({ name: trimmed, slug });
      await setActive.mutateAsync({ organizationId: (org as { id: string }).id });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const isPending = createOrg.isPending || setActive.isPending;

  return (
    <div className="rounded-lg border border-(--border-primary) bg-(--surface-primary) p-8">
      <h2 className="text-xl font-semibold mb-2">Create your organization</h2>
      <p className="text-sm text-(--text-secondary) mb-6">
        Get started by creating an organization. You can invite team members later.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="org-name" className="block text-sm font-medium text-(--text-primary) mb-1">
            Organization name
          </label>
          <input
            id="org-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Company"
            maxLength={100}
            required
            className="w-full rounded-md border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm outline-none focus:border-(--color-brand-500) focus:ring-1 focus:ring-(--color-brand-500)"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--gradient-brand)' }}
        >
          {isPending ? 'Creating...' : 'Create Organization'}
        </button>
      </form>
    </div>
  );
}
