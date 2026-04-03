import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsCategories } from '@/server/db/schema';
import { ContentStatus } from '@/engine/types/cms';
import {
  apiHeaders,
  checkRateLimit,
  validateApiKey,
} from '@/engine/lib/api-auth';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
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
    const { slug } = await params;

    const url = new URL(request.url);
    const lang = url.searchParams.get('lang') ?? undefined;

    const conditions = [
      eq(cmsCategories.slug, slug),
      eq(cmsCategories.status, ContentStatus.PUBLISHED),
      isNull(cmsCategories.deletedAt),
    ];
    if (lang) conditions.push(eq(cmsCategories.lang, lang));

    const [category] = await db
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
      .where(and(...conditions))
      .limit(1);

    if (!category) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: apiHeaders() }
      );
    }

    return NextResponse.json({ data: category }, { headers: apiHeaders() });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: apiHeaders() }
    );
  }
}
