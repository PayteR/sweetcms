'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { accountRoutes } from '@/config/routes';

export default function NewTicketPage() {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [error, setError] = useState('');

  const createTicket = trpc.support.create.useMutation({
    onSuccess: (data) => {
      router.push(accountRoutes.supportDetail(data.id));
    },
    onError: (err) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    createTicket.mutate({ subject, body, priority });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={accountRoutes.support}
          className="rounded-lg p-1.5 text-(--text-muted) hover:bg-(--surface-secondary)"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">New Support Ticket</h1>
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-(--border-primary) p-6 space-y-4 max-w-2xl">
        {error && (
          <div className="text-sm text-(--color-danger-500) bg-(--color-danger-500)/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Subject</label>
          <input
            type="text"
            required
            maxLength={255}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm"
            placeholder="Briefly describe your issue"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high' | 'urgent')}
            className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            required
            maxLength={5000}
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-(--border-primary) bg-(--surface-primary) text-sm resize-y"
            placeholder="Provide as much detail as possible..."
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createTicket.isPending}
            className="inline-flex items-center gap-2 py-2 px-4 rounded-lg font-medium text-sm bg-(--color-brand-500) text-white hover:bg-(--color-brand-600) transition-colors disabled:opacity-50"
          >
            {createTicket.isPending && <Loader2 size={16} className="animate-spin" />}
            Submit Ticket
          </button>
          <Link
            href={accountRoutes.support}
            className="py-2 px-4 rounded-lg text-sm border border-(--border-primary) hover:bg-(--surface-secondary) transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
