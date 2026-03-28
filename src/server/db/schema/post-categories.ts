import { pgTable, uuid, index, primaryKey } from 'drizzle-orm/pg-core';

import { cmsPosts } from './cms';
import { cmsCategories } from './categories';

// ─── cms_post_categories (join table) ────────────────────────────────────────

export const cmsPostCategories = pgTable(
  'cms_post_categories',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => cmsPosts.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => cmsCategories.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.categoryId] }),
    index('cms_post_categories_post_id_idx').on(t.postId),
    index('cms_post_categories_category_id_idx').on(t.categoryId),
  ]
);

export type CmsPostCategory = typeof cmsPostCategories.$inferSelect;
export type NewCmsPostCategory = typeof cmsPostCategories.$inferInsert;
