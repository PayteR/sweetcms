import { FileText, FolderOpen, Tag } from 'lucide-react';

import type { TypeConfig } from '@/engine/components/InternalLinkDialog';

export const INTERNAL_LINK_TYPE_CONFIG: TypeConfig = {
  page: { label: 'Page', icon: FileText, color: 'bg-(--color-brand-600)' },
  blog: { label: 'Blog', icon: FileText, color: 'bg-purple-600' },
  category: { label: 'Category', icon: FolderOpen, color: 'bg-yellow-600' },
  tag: { label: 'Tag', icon: Tag, color: 'bg-green-600' },
};
