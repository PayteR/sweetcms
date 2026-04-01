import Link from 'next/link';

import { db } from '@/server/db';
import { cmsCategories, cmsPosts, cmsTermRelationships } from '@/server/db/schema';
import { ContentStatus } from '@/engine/types/cms';
import { and, count, eq, isNull } from 'drizzle-orm';
import { serverTRPC } from '@/lib/trpc/server';

async function getCategories() {
  try {
    const rows = await db
      .select({
        name: cmsCategories.name,
        slug: cmsCategories.slug,
        postCount: count(cmsPosts.id),
      })
      .from(cmsCategories)
      .leftJoin(
        cmsTermRelationships,
        and(
          eq(cmsTermRelationships.termId, cmsCategories.id),
          eq(cmsTermRelationships.taxonomyId, 'category')
        )
      )
      .leftJoin(
        cmsPosts,
        and(
          eq(cmsPosts.id, cmsTermRelationships.objectId),
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          isNull(cmsPosts.deletedAt)
        )
      )
      .where(
        and(
          eq(cmsCategories.status, ContentStatus.PUBLISHED),
          eq(cmsCategories.lang, 'en'),
          isNull(cmsCategories.deletedAt)
        )
      )
      .groupBy(cmsCategories.id)
      .orderBy(cmsCategories.order)
      .limit(10);
    return rows;
  } catch {
    return [];
  }
}

async function getPopularTags() {
  try {
    const api = await serverTRPC();
    return await api.tags.listPopular({ lang: 'en', limit: 15 });
  } catch {
    return [];
  }
}

export async function BlogSidebar() {
  const [categories, tags] = await Promise.all([
    getCategories(),
    getPopularTags(),
  ]);

  return (
    <aside className="sidebar">
      {/* Search */}
      <div>
        <h3 className="sidebar-title">Search</h3>
        <form action="/search" method="GET">
          <input
            type="text"
            name="q"
            placeholder="Search posts..."
            className="input"
          />
        </form>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div>
          <h3 className="sidebar-title">Categories</h3>
          <div className="sidebar-list">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="sidebar-link"
              >
                <span>{cat.name}</span>
                {Number(cat.postCount) > 0 && (
                  <span className="sidebar-count">{Number(cat.postCount)}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Popular Tags */}
      {tags.length > 0 && (
        <div>
          <h3 className="sidebar-title">Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Link key={tag.id} href={`/tag/${tag.slug}`} className="tag">
                {tag.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
