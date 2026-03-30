/**
 * Taxonomy Registry
 *
 * Declares taxonomy types available in the CMS.
 * - `customTable: true` = taxonomy has its own rich schema table (e.g. cms_categories)
 * - `customTable: false` = taxonomy uses the universal `cms_terms` table
 *
 * To add a new taxonomy:
 * 1. Add a declaration here
 * 2. If customTable: false, add admin CRUD in the tags router pattern
 * 3. Register in cms.ts CONTENT_TYPES if it needs a public detail page
 * 4. Add TagInput/checkbox UI in PostForm
 */

export interface TaxonomyDeclaration {
  /** Unique taxonomy identifier */
  id: string;
  /** Singular label */
  label: string;
  /** Plural label */
  labelPlural: string;
  /** URL prefix for public pages */
  urlPrefix: string;
  /** Admin URL slug */
  adminSlug: string;
  /** true = own schema table, false = cms_terms */
  customTable: boolean;
  /** Which content type IDs this taxonomy applies to */
  contentTypes: string[];
  /** UI input type in PostForm sidebar */
  inputType: 'checkbox' | 'tag-input';
  /** Whether this taxonomy has a public detail page */
  hasDetailPage: boolean;
  /** Sitemap slug (if hasDetailPage) */
  sitemapSlug?: string;
}

const taxonomiesDef: readonly TaxonomyDeclaration[] = [
  {
    id: 'category',
    label: 'Category',
    labelPlural: 'Categories',
    urlPrefix: '/category/',
    adminSlug: 'categories',
    customTable: true,
    contentTypes: ['blog'],
    inputType: 'checkbox',
    hasDetailPage: true,
    sitemapSlug: 'category-pages',
  },
  {
    id: 'tag',
    label: 'Tag',
    labelPlural: 'Tags',
    urlPrefix: '/tag/',
    adminSlug: 'tags',
    customTable: false,
    contentTypes: ['blog', 'page', 'portfolio'],
    inputType: 'tag-input',
    hasDetailPage: true,
    sitemapSlug: 'tag-pages',
  },
];

export const TAXONOMIES: readonly TaxonomyDeclaration[] = taxonomiesDef;

const taxonomyMap = new Map(TAXONOMIES.map((t) => [t.id, t]));
const adminSlugMap = new Map(TAXONOMIES.map((t) => [t.adminSlug, t]));

export function getTaxonomy(id: string): TaxonomyDeclaration {
  const t = taxonomyMap.get(id);
  if (!t) throw new Error(`Unknown taxonomy: ${id}`);
  return t;
}

export function getTaxonomyByAdminSlug(
  slug: string
): TaxonomyDeclaration | undefined {
  return adminSlugMap.get(slug);
}

export function getTaxonomiesForContentType(
  contentTypeId: string
): TaxonomyDeclaration[] {
  return TAXONOMIES.filter((t) => t.contentTypes.includes(contentTypeId));
}
