'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

import { ContentCalendar } from '@/engine/components/ContentCalendar';
import { adminPanel } from '@/config/routes';

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="calendar-loading flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
        </div>
      }
    >
      <ContentCalendar editUrlBuilder={(section, id) => adminPanel.cmsItem(section, id)} />
    </Suspense>
  );
}
