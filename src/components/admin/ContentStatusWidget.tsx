'use client';

import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { PostType } from '@/engine/types/cms';

export default function ContentStatusWidget() {
  const __ = useBlankTranslations();
  const pageCounts = trpc.cms.counts.useQuery({ type: PostType.PAGE });
  const blogCounts = trpc.cms.counts.useQuery({ type: PostType.BLOG });

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="widget-header">
        <h2 className="h2">{__('Content Status')}</h2>
      </div>
      <div className="stat-grid px-4">
        {[
          { label: __('Published pages'), count: pageCounts.data?.published },
          { label: __('Draft pages'), count: pageCounts.data?.draft },
          { label: __('Published posts'), count: blogCounts.data?.published },
          { label: __('Draft posts'), count: blogCounts.data?.draft },
          { label: __('Scheduled'), count: (pageCounts.data?.scheduled ?? 0) + (blogCounts.data?.scheduled ?? 0) },
        ].map((row) => (
          <div key={row.label} className="stat-row">
            <span className="stat-label">{row.label}</span>
            <span className="stat-value">{row.count ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
