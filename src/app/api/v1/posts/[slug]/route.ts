import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { ContentStatus } from '@/types/cms';
import {
  apiHeaders,
  checkRateLimit,
  validateApiKey,
} from '@/server/utils/api-auth';

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
  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: apiHeaders() }
    );
  }

  const { slug } = await params;

  const url = new URL(request.url);
  const lang = url.searchParams.get('lang') ?? undefined;
  const preview = url.searchParams.get('preview') ?? undefined;

  const conditions = [
    eq(cmsPosts.slug, slug),
    isNull(cmsPosts.deletedAt),
  ];

  // Preview mode: bypass PUBLISHED check, validate token instead
  if (preview) {
    conditions.push(eq(cmsPosts.previewToken, preview));
  } else {
    conditions.push(eq(cmsPosts.status, ContentStatus.PUBLISHED));
  }

  if (lang) conditions.push(eq(cmsPosts.lang, lang));

  const [post] = await db
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
      featuredImageAlt: cmsPosts.featuredImageAlt,
      jsonLd: cmsPosts.jsonLd,
      publishedAt: cmsPosts.publishedAt,
      createdAt: cmsPosts.createdAt,
      updatedAt: cmsPosts.updatedAt,
    })
    .from(cmsPosts)
    .where(and(...conditions))
    .limit(1);

  if (!post) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: apiHeaders() }
    );
  }

  return NextResponse.json({ data: post }, { headers: apiHeaders() });
}
