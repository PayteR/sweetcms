import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { cmsMedia } from '@/server/db/schema';
import { getStorage } from '@/server/storage';
import { slugifyFilename } from '@/lib/slug';
import { FileType } from '@/types/cms';
import { parsePagination, paginatedResult } from '@/server/utils/admin-crud';
import {
  createTRPCRouter,
  sectionProcedure,
  staffProcedure,
} from '../trpc';

const mediaProcedure = sectionProcedure('media');

function getFileType(mimeType: string): number {
  if (mimeType.startsWith('image/')) return FileType.IMAGE;
  if (mimeType.startsWith('video/')) return FileType.VIDEO;
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('text/')
  )
    return FileType.DOCUMENT;
  return FileType.OTHER;
}

export const mediaRouter = createTRPCRouter({
  /** Count total media files */
  count: mediaProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({ count: count() })
      .from(cmsMedia)
      .where(isNull(cmsMedia.deletedAt));
    return { count: row?.count ?? 0 };
  }),

  /** List media files */
  list: mediaProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        fileType: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [isNull(cmsMedia.deletedAt)];
      if (input.fileType != null) {
        conditions.push(eq(cmsMedia.fileType, input.fileType));
      }

      const where = and(...conditions);

      const [items, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(cmsMedia)
          .where(where)
          .orderBy(desc(cmsMedia.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: cmsMedia.id })
          .from(cmsMedia)
          .where(where),
      ]);

      // Add URL to each item
      const storage = getStorage();
      const withUrls = items.map((item) => ({
        ...item,
        url: storage.url(item.filepath),
      }));

      return paginatedResult(withUrls, countResult.length, page, pageSize);
    }),

  /** Register an uploaded file in the media library */
  register: mediaProcedure
    .input(
      z.object({
        filename: z.string().max(255),
        filepath: z.string().max(1024),
        mimeType: z.string().max(100),
        fileSize: z.number().int().min(0),
        altText: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const safeFilename = slugifyFilename(input.filename);
      const fileType = getFileType(input.mimeType);

      const [media] = await ctx.db
        .insert(cmsMedia)
        .values({
          filename: safeFilename,
          filepath: input.filepath,
          fileType,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          altText: input.altText ?? null,
          uploadedById: ctx.session.user.id as string,
        })
        .returning();

      return media!;
    }),

  /** Soft-delete a media file */
  delete: mediaProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(cmsMedia)
        .where(
          and(eq(cmsMedia.id, input.id), isNull(cmsMedia.deletedAt))
        )
        .limit(1);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Media file not found',
        });
      }

      await ctx.db
        .update(cmsMedia)
        .set({ deletedAt: new Date() })
        .where(eq(cmsMedia.id, input.id));

      return { success: true };
    }),
});
