'use client';

import Link from 'next/link';
import {
  FileText, Layers, FolderOpen, Briefcase, Image, ExternalLink,
} from 'lucide-react';

import { useBlankTranslations } from '@/lib/translations';

export default function QuickActionsWidget() {
  const __ = useBlankTranslations();

  return (
    <div className="admin-card flex flex-col overflow-hidden">
      <div className="admin-widget-header">
        <h2 className="admin-h2">{__('Quick Actions')}</h2>
      </div>
      <div className="admin-quick-actions-grid p-4 grid grid-cols-2 gap-2">
        <Link href="/dashboard/cms/pages/new" className="admin-btn admin-btn-secondary justify-center">
          <FileText className="h-4 w-4" />
          {__('New Page')}
        </Link>
        <Link href="/dashboard/cms/blog/new" className="admin-btn admin-btn-secondary justify-center">
          <Layers className="h-4 w-4" />
          {__('New Post')}
        </Link>
        <Link href="/dashboard/cms/categories/new" className="admin-btn admin-btn-secondary justify-center">
          <FolderOpen className="h-4 w-4" />
          {__('New Category')}
        </Link>
        <Link href="/dashboard/cms/portfolio/new" className="admin-btn admin-btn-secondary justify-center">
          <Briefcase className="h-4 w-4" />
          {__('New Project')}
        </Link>
        <Link href="/dashboard/media" className="admin-btn admin-btn-secondary justify-center">
          <Image className="h-4 w-4" />
          {__('Media Library')}
        </Link>
        <a href="/" target="_blank" rel="noopener noreferrer" className="admin-btn admin-btn-secondary justify-center">
          <ExternalLink className="h-4 w-4" />
          {__('View Site')}
        </a>
      </div>
    </div>
  );
}
