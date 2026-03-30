import type { Metadata } from 'next';
import Link from 'next/link';

import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';

export const metadata: Metadata = {
  title: `Portfolio | ${siteConfig.name}`,
  description: 'Browse our portfolio of projects and case studies.',
};

export default async function PortfolioListPage() {
  const api = await serverTRPC();
  const { results: items } = await api.portfolio.listPublished({
    lang: 'en',
    pageSize: 100,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold text-(--text-primary) sm:text-4xl">
        Portfolio
      </h1>
      <p className="mt-2 text-(--text-muted)">
        Browse our projects and case studies.
      </p>

      {items.length > 0 ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/portfolio/${item.slug}`}
              className="group overflow-hidden rounded-lg border border-(--border-primary) bg-(--surface-primary) transition-shadow hover:shadow-md"
            >
              {item.featuredImage && (
                <img
                  src={item.featuredImage}
                  alt={item.featuredImageAlt ?? item.title}
                  className="h-48 w-full object-cover transition-transform group-hover:scale-105"
                />
              )}
              <div className="p-4">
                <h2 className="text-lg font-semibold text-(--text-primary) group-hover:text-blue-600">
                  {item.title}
                </h2>
                {item.clientName && (
                  <p className="mt-1 text-sm text-(--text-muted)">{item.clientName}</p>
                )}
                {item.techStack && item.techStack.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.techStack.slice(0, 4).map((tech) => (
                      <span
                        key={tech}
                        className="inline-block rounded-full bg-blue-50 dark:bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400"
                      >
                        {tech}
                      </span>
                    ))}
                    {item.techStack.length > 4 && (
                      <span className="inline-block rounded-full bg-(--surface-secondary) px-2 py-0.5 text-[11px] text-(--text-muted)">
                        +{item.techStack.length - 4}
                      </span>
                    )}
                  </div>
                )}
                {item.completedAt && (
                  <p className="mt-2 text-xs text-(--text-muted)">
                    {new Date(item.completedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                    })}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-10 text-(--text-muted)">No portfolio items yet.</p>
      )}
    </div>
  );
}
