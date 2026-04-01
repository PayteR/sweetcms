import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

import { ContentCalendar } from '@/components/admin/ContentCalendar';

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="admin-calendar-loading flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
        </div>
      }
    >
      <ContentCalendar />
    </Suspense>
  );
}
