import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { getContentTypeByAdminSlug } from '@/config/cms';
import { CmsListView } from '@/components/admin/CmsListView';

interface Props {
  params: Promise<{ section: string }>;
}

export default async function CmsSectionPage({ params }: Props) {
  const { section } = await params;
  const contentType = getContentTypeByAdminSlug(section);

  if (!contentType) {
    notFound();
  }

  return (
    <div className="shell-inner">
      <Suspense
        fallback={
          <div className="section-loading flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        }
      >
        <CmsListView contentType={contentType} />
      </Suspense>
    </div>
  );
}
