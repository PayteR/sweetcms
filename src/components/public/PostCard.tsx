import Link from 'next/link';

interface Tag {
  name: string;
  slug: string;
}

interface Props {
  title: string;
  href: string;
  metaDescription?: string | null;
  publishedAt?: Date | string | null;
  tags?: Tag[];
  /** Render as a card (home page grid) vs article (blog list) */
  variant?: 'article' | 'card';
}

export function PostCard({
  title,
  href,
  metaDescription,
  publishedAt,
  tags,
  variant = 'article',
}: Props) {
  const dateStr = publishedAt
    ? new Date(publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  if (variant === 'card') {
    return (
      <Link
        href={href}
        className="cms-post-card group rounded-lg border border-(--border-primary) bg-(--surface-primary) p-6 shadow-sm transition-shadow hover:shadow-md"
      >
        <h3 className="text-lg font-semibold text-(--text-primary) group-hover:text-(--color-brand-600)">
          {title}
        </h3>
        {metaDescription && (
          <p className="mt-2 text-sm text-(--text-secondary) line-clamp-2">
            {metaDescription}
          </p>
        )}
        {tags && tags.length > 0 && (
          <div className="cms-post-card-tags mt-3 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span key={tag.slug} className="cms-tag">
                {tag.name}
              </span>
            ))}
          </div>
        )}
        {dateStr && (
          <time className="mt-3 block text-xs text-(--text-muted)">{dateStr}</time>
        )}
      </Link>
    );
  }

  return (
    <article className="cms-post-card-article border-b border-(--border-secondary) pb-6">
      <Link
        href={href}
        className="text-xl font-semibold text-(--text-primary) hover:text-(--color-brand-600)"
      >
        {title}
      </Link>
      {metaDescription && (
        <p className="mt-2 text-(--text-secondary)">{metaDescription}</p>
      )}
      {tags && tags.length > 0 && (
        <div className="cms-post-card-tags mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Link key={tag.slug} href={`/tag/${tag.slug}`} className="cms-tag">
              {tag.name}
            </Link>
          ))}
        </div>
      )}
      {dateStr && (
        <time className="mt-1 block text-sm text-(--text-muted)">{dateStr}</time>
      )}
    </article>
  );
}
