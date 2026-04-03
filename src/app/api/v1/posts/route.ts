import { NextResponse } from 'next/server';
import { and, count as drizzleCount, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { ContentStatus } from '@/engine/types/cms';
import {
  apiHeaders,
  checkRateLimit,
  validateApiKey,
} from '@/engine/lib/api-auth';

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

  try {
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
    const type = url.searchParams.get('type') ?? undefined;
    const offset = (page - 1) * pageSize;

    const conditions = [
      eq(cmsPosts.status, ContentStatus.PUBLISHED),
      isNull(cmsPosts.deletedAt),
    ];
    if (lang) conditions.push(eq(cmsPosts.lang, lang));
    if (type) conditions.push(eq(cmsPosts.type, parseInt(type, 10)));

    const where = and(...conditions);

    const [posts, countResult] = await Promise.all([
      db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          content: cmsPosts.content,
          type: cmsPosts.type,
          lang: cmsPosts.lang,
          metaDescription: cmsPosts.metaDescription,
          seoTitle: cmsPosts.seoTitle,
          featuredImage: cmsPosts.featuredImage,
          publishedAt: cmsPosts.publishedAt,
          createdAt: cmsPosts.createdAt,
          updatedAt: cmsPosts.updatedAt,
        })
        .from(cmsPosts)
        .where(where)
        .orderBy(desc(cmsPosts.publishedAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: drizzleCount() }).from(cmsPosts).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;

    return NextResponse.json(
      {
        data: posts,
        meta: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      },
      { headers: apiHeaders() }
    );
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: apiHeaders() }
    );
  }
}
