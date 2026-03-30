import { PostType } from '@/types/cms';

/**
 * CMS Content Types Registry
 *
 * Single source of truth for all content types served by the app.
 *
 * To add a new content type:
 * 1. Add a config entry here
 * 2. For post-backed types: auto-registered. For others: call registerContentResolver()
 * 3. Add list/detail templates in [...slug]/_templates/
 * 4. Register renderers in [...slug]/registry.tsx
 * 5. Add sitemap route using createCmsSitemapHandler()
 */

export interface ContentTypeDeclaration {
  /** Unique id — used for cache invalidation and slug resolution */
  id: string;
  /** URL prefix where this content is served ('/' = root, '/blog/' = prefixed) */
  urlPrefix: string;
  /** Top-level URL segment for the list page */
  listSegment: string;
  /** Human-readable title for the list page */
  listTitle: string;
  /** Whether this type can override SEO of coded routes */
  canOverrideCodedRouteSEO: boolean;
  /** Whether missing-language pages should fall back to default locale */
  fallbackToDefault: boolean;
  /** Human-readable singular label */
  label: string;
  /** Human-readable plural label */
  labelPlural: string;
  /** PostType value — only for cms_posts-backed types */
  postType?: number;
  /** URL slug for the admin section (e.g. 'pages' → /dashboard/cms/pages) */
  adminSlug: string;
  /** Admin capability required to edit this content type */
  adminCapability: 'section.content';
  /** Title template for pages. Vars: {title}, {sitename}, {page}. [...] = conditional. */
  titleTemplate: string;
  /** Sitemap XML filename slug. Omit to exclude from sitemap index. */
  sitemapSlug?: string;
  /** Override sidebar label. Defaults to labelPlural. */
  sidebarLabel?: string;
  /** Which optional fields to show in PostForm */
  postFormFields?: {
    featuredImage?: boolean;
    jsonLd?: boolean;
  };
  /** Fallback description for list page metadata */
  listDescription?: string;
}

const contentTypesDef = [
  {
    id: 'page',
    urlPrefix: '/',
    listSegment: 'pages',
    listTitle: 'Pages',
    canOverrideCodedRouteSEO: true,
    fallbackToDefault: true,
    label: 'Page',
    labelPlural: 'Pages',
    postType: PostType.PAGE,
    adminSlug: 'pages',
    adminCapability: 'section.content',
    titleTemplate: '{title}[ - {page}] | {sitename}',
    sitemapSlug: 'cms-pages',
    postFormFields: { featuredImage: true, jsonLd: true },
  },
  {
    id: 'blog',
    urlPrefix: '/blog/',
    listSegment: 'blog',
    listTitle: 'Blog',
    canOverrideCodedRouteSEO: false,
    fallbackToDefault: true,
    label: 'Blog Post',
    labelPlural: 'Blog Posts',
    sidebarLabel: 'Blog',
    postType: PostType.BLOG,
    adminSlug: 'blog',
    adminCapability: 'section.content',
    titleTemplate: '{title}[ - {page}] | {sitename}',
    sitemapSlug: 'cms-blog',
    postFormFields: { featuredImage: true, jsonLd: true },
  },
  {
    id: 'category',
    urlPrefix: '/category/',
    listSegment: 'category',
    listTitle: 'Categories',
    canOverrideCodedRouteSEO: false,
    fallbackToDefault: true,
    label: 'Category',
    labelPlural: 'Categories',
    adminSlug: 'categories',
    adminCapability: 'section.content',
    titleTemplate: '{title}[ - {page}] | {sitename}',
    sitemapSlug: 'category-pages',
  },
  {
    id: 'tag',
    urlPrefix: '/tag/',
    listSegment: 'tag',
    listTitle: 'Tags',
    canOverrideCodedRouteSEO: false,
    fallbackToDefault: false,
    label: 'Tag',
    labelPlural: 'Tags',
    adminSlug: 'tags',
    adminCapability: 'section.content',
    titleTemplate: '{title}[ - {page}] | {sitename}',
    sitemapSlug: 'tag-pages',
    listDescription: 'Browse content by tag.',
  },
  {
    id: 'landing',
    urlPrefix: '/landing/',
    listSegment: 'landing',
    listTitle: 'Landing Pages',
    canOverrideCodedRouteSEO: false,
    fallbackToDefault: true,
    label: 'Landing Page',
    labelPlural: 'Landing Pages',
    postType: PostType.LANDING,
    adminSlug: 'landingpages',
    adminCapability: 'section.content',
    titleTemplate: '{title} | {sitename}',
    sitemapSlug: 'cms-landing',
    postFormFields: { featuredImage: true, jsonLd: true },
  },
] as const satisfies readonly ContentTypeDeclaration[];

export const CONTENT_TYPES: readonly ContentTypeDeclaration[] = contentTypesDef;

/** IDs of content types that use PostForm (have postType). */
export type PostContentTypeId = Extract<
  (typeof contentTypesDef)[number],
  { postType: number }
>['id'];

/** Admin URL slugs from the config. */
export type AdminSlug = (typeof contentTypesDef)[number]['adminSlug'];

const contentTypeMap = new Map(CONTENT_TYPES.map((ct) => [ct.id, ct]));

export function getContentType(id: string): ContentTypeDeclaration {
  const ct = contentTypeMap.get(id);
  if (!ct) throw new Error(`Unknown content type: ${id}`);
  return ct;
}

const postTypeMap = new Map(
  CONTENT_TYPES.filter((ct) => ct.postType != null).map((ct) => [
    ct.postType!,
    ct,
  ])
);

export function getContentTypeByPostType(
  postType: number
): ContentTypeDeclaration {
  const ct = postTypeMap.get(postType);
  if (!ct) throw new Error(`Unknown post type: ${postType}`);
  return ct;
}

const adminSlugMap = new Map(CONTENT_TYPES.map((ct) => [ct.adminSlug, ct]));

export function getContentTypeByAdminSlug(
  slug: string
): ContentTypeDeclaration | undefined {
  return adminSlugMap.get(slug);
}
