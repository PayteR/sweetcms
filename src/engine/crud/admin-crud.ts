import { TRPCError } from '@trpc/server';
import {
  type AnyColumn,
  type SQL,
  and,
  asc,
  desc,
  count as drizzleCount,
  eq,
  isNotNull,
  isNull,
  ne,
  sql,
} from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { DbClient, DrizzleDB, DrizzleDBOrTx } from '@/server/db';
import { getAffectedRows, wordSplitLike } from '@/server/db/drizzle-utils';
import { cmsContentRevisions, cmsSlugRedirects } from '@/server/db/schema';
import { ContentStatus } from '@/engine/types/cms';

// ---------------------------------------------------------------------------
// Column refs for generic CRUD
// ---------------------------------------------------------------------------

export interface CrudColumns {
  table: PgTable;
  id: PgColumn;
  deleted_at: PgColumn;
}

// ---------------------------------------------------------------------------
// Soft-delete / restore / permanent-delete
// ---------------------------------------------------------------------------

export async function softDelete(
  db: DbClient,
  cols: CrudColumns,
  id: string
): Promise<void> {
  const result = await db.execute(
    sql`UPDATE ${cols.table} SET ${cols.deleted_at} = NOW() WHERE ${cols.id} = ${id} AND ${cols.deleted_at} IS NULL`
  );
  if (getAffectedRows(result) === 0) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Record not found' });
  }
}

export async function softRestore(
  db: DbClient,
  cols: CrudColumns,
  id: string,
  preRestoreCheck?: (db: DbClient, id: string) => Promise<void>
): Promise<void> {
  if (preRestoreCheck) {
    await preRestoreCheck(db, id);
  }
  const result = await db.execute(
    sql`UPDATE ${cols.table} SET ${cols.deleted_at} = NULL WHERE ${cols.id} = ${id} AND ${cols.deleted_at} IS NOT NULL`
  );
  if (getAffectedRows(result) === 0) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Trashed record not found',
    });
  }
}

export async function permanentDelete(
  db: DrizzleDB,
  cols: CrudColumns,
  id: string,
  contentTypeId: string,
  cascadeDeletes?: (tx: DrizzleDBOrTx, id: string) => Promise<void>
): Promise<void> {
  const [exists] = await db
    .select({ id: cols.id })
    .from(cols.table)
    .where(and(eq(cols.id, id), isNotNull(cols.deleted_at)))
    .limit(1);

  if (!exists) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Trashed record not found',
    });
  }

  await db.transaction(async (tx) => {
    if (cascadeDeletes) await cascadeDeletes(tx, id);
    await tx
      .delete(cmsContentRevisions)
      .where(
        and(
          eq(cmsContentRevisions.contentType, contentTypeId),
          eq(cmsContentRevisions.contentId, id)
        )
      );
    await tx
      .delete(cmsSlugRedirects)
      .where(
        and(
          eq(cmsSlugRedirects.contentType, contentTypeId),
          eq(cmsSlugRedirects.contentId, id)
        )
      );
    await tx.execute(sql`DELETE FROM ${cols.table} WHERE ${cols.id} = ${id}`);
  });
}

// ---------------------------------------------------------------------------
// Admin list query builder
// ---------------------------------------------------------------------------

export interface AdminListInput {
  search?: string;
  trashed?: boolean;
  lang?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface AdminListCols {
  table: PgTable;
  id: PgColumn;
  deleted_at: PgColumn;
  lang: PgColumn;
  translation_group: PgColumn;
}

export async function buildAdminList<T>(
  config: {
    db: DbClient;
    cols: AdminListCols;
    input?: AdminListInput;
    searchColumns: AnyColumn[];
    sortColumns: Record<string, AnyColumn>;
    defaultSort: string;
    extraConditions?: (SQL | undefined)[];
  },
  findFn: (params: {
    where: SQL | undefined;
    orderBy: SQL;
    offset: number;
    limit: number;
  }) => Promise<T[]>
): Promise<{
  results: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const { db, cols, input, searchColumns, sortColumns, defaultSort } = config;
  const page = input?.page ?? 1;
  const pageSize = input?.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const conditions: (SQL | undefined)[] = [];
  if (input?.trashed) {
    conditions.push(isNotNull(cols.deleted_at));
  } else {
    conditions.push(isNull(cols.deleted_at));
  }
  if (input?.lang) conditions.push(eq(cols.lang, input.lang));
  if (input?.search) {
    conditions.push(wordSplitLike(input.search, searchColumns));
  }
  if (config.extraConditions) {
    conditions.push(...config.extraConditions);
  }

  const where = and(...conditions.filter(Boolean));

  const sortCol = sortColumns[input?.sortBy ?? defaultSort];
  const orderBy =
    (input?.sortDir ?? 'desc') === 'asc' ? asc(sortCol!) : desc(sortCol!);

  const [items, countResult] = await Promise.all([
    findFn({ where, orderBy, offset, limit: pageSize }),
    db.select({ count: drizzleCount() }).from(cols.table).where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  return { results: items, total, page, pageSize, totalPages };
}

// ---------------------------------------------------------------------------
// Status counts (admin tabs)
// ---------------------------------------------------------------------------

export interface StatusCountCols {
  table: PgTable;
  status: PgColumn;
  deleted_at: PgColumn;
}

export async function buildStatusCounts(
  db: DbClient,
  cols: StatusCountCols,
  extraWhere?: SQL
): Promise<{
  all: number;
  draft: number;
  published: number;
  scheduled: number;
  trash: number;
}> {
  const result = await db
    .select({
      active: sql<string>`SUM(CASE WHEN ${cols.deleted_at} IS NULL THEN 1 ELSE 0 END)`,
      draft: sql<string>`SUM(CASE WHEN ${cols.deleted_at} IS NULL AND ${cols.status} = ${ContentStatus.DRAFT} THEN 1 ELSE 0 END)`,
      published: sql<string>`SUM(CASE WHEN ${cols.deleted_at} IS NULL AND ${cols.status} = ${ContentStatus.PUBLISHED} THEN 1 ELSE 0 END)`,
      scheduled: sql<string>`SUM(CASE WHEN ${cols.deleted_at} IS NULL AND ${cols.status} = ${ContentStatus.SCHEDULED} THEN 1 ELSE 0 END)`,
      trash: sql<string>`SUM(CASE WHEN ${cols.deleted_at} IS NOT NULL THEN 1 ELSE 0 END)`,
    })
    .from(cols.table)
    .where(extraWhere);
  const r = result[0];
  return {
    all: Number(r?.active ?? 0),
    draft: Number(r?.draft ?? 0),
    published: Number(r?.published ?? 0),
    scheduled: Number(r?.scheduled ?? 0),
    trash: Number(r?.trash ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Slug uniqueness check
// ---------------------------------------------------------------------------

export async function ensureSlugUnique(
  db: DbClient,
  config: {
    table: PgTable;
    slugCol: PgColumn;
    slug: string;
    idCol?: PgColumn;
    excludeId?: string;
    langCol?: PgColumn;
    lang?: string;
    deletedAtCol?: PgColumn;
    extraConditions?: SQL[];
  },
  entityName: string
): Promise<void> {
  const conditions: (SQL | undefined)[] = [eq(config.slugCol, config.slug)];
  if (config.langCol && config.lang) {
    conditions.push(eq(config.langCol, config.lang));
  }
  if (config.idCol && config.excludeId != null) {
    conditions.push(ne(config.idCol, config.excludeId));
  }
  if (config.deletedAtCol) {
    conditions.push(isNull(config.deletedAtCol));
  }
  if (config.extraConditions) {
    conditions.push(...config.extraConditions);
  }

  const [existing] = await db
    .select({ id: config.slugCol })
    .from(config.table)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `A ${entityName} with slug "${config.slug}" already exists`,
    });
  }
}

// ---------------------------------------------------------------------------
// Pagination helpers
// ---------------------------------------------------------------------------

export function parsePagination(
  input?: { page?: number; pageSize?: number },
  defaultPageSize = 20
): { page: number; pageSize: number; offset: number } {
  const page = input?.page ?? 1;
  const pageSize = input?.pageSize ?? defaultPageSize;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  return {
    results: items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
