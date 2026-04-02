import { NextResponse } from 'next/server';
import { and, asc, count as drizzleCount, eq, isNull } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsCategories } from '@/server/db/schema';
import { ContentStatus } from '@/engine/types/cms';
import {
  apiHeaders,
  checkRateLimit,
  validateApiKey,
} from '@/server/utils/api-auth';

export async function GET(request: Request) {
  if (!(await validateApiKey(request))) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 401, headers: apiHeaders() }
    );
  }
  if (!(await checkRateLimit(request))) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: apiHeaders() }
    );
  }

  const url = new URL(request.url);
  const page = Math.max(
    1,
    parseInt(url.searchParams.get('page') ?? '1', 10)
  );
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10))
  );
  const lang = url.searchParams.get('lang') ?? undefined;
  const offset = (page - 1) * pageSize;

  const conditions = [
    eq(cmsCategories.status, ContentStatus.PUBLISHED),
    isNull(cmsCategories.deletedAt),
  ];
  if (lang) conditions.push(eq(cmsCategories.lang, lang));

  const where = and(...conditions);

  const [categories, countResult] = await Promise.all([
    db
      .select({
        id: cmsCategories.id,
        name: cmsCategories.name,
        slug: cmsCategories.slug,
        lang: cmsCategories.lang,
        title: cmsCategories.title,
        text: cmsCategories.text,
        icon: cmsCategories.icon,
        metaDescription: cmsCategories.metaDescription,
        seoTitle: cmsCategories.seoTitle,
        order: cmsCategories.order,
        publishedAt: cmsCategories.publishedAt,
        createdAt: cmsCategories.createdAt,
        updatedAt: cmsCategories.updatedAt,
      })
      .from(cmsCategories)
      .where(where)
      .orderBy(asc(cmsCategories.order))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: drizzleCount() })
      .from(cmsCategories)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;

  return NextResponse.json(
    {
      data: categories,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    },
    { headers: apiHeaders() }
  );
}
