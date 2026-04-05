import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, ne } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { auth } from '@/lib/auth';
import { user, session } from '@/server/db/schema/auth';
import { logAudit } from '@/engine/lib/audit';

export const authRouter = createTRPCRouter({
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),

  me: protectedProcedure.query(({ ctx }) => {
    return ctx.session.user;
  }),

  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(user)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(user.id, ctx.session.user.id));
      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1).max(200),
        newPassword: z.string().min(6).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await auth.api.changePassword({
          headers: ctx.headers,
          body: {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
          },
        });
        return { success: true };
      } catch {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Current password is incorrect',
        });
      }
    }),

  deleteAccount: protectedProcedure
    .input(
      z
        .object({ mode: z.enum(['full', 'pseudonymize']).default('full') })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const mode = input?.mode ?? 'full';
      const { anonymizeUser } = await import('@/engine/lib/gdpr');

      try {
        await anonymizeUser(ctx.db, userId, userId, mode);
      } catch (err) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: err instanceof Error ? err.message : 'Account deletion failed',
        });
      }

      logAudit({
        db: ctx.db,
        userId,
        action: 'auth.deleteAccount',
        entityType: 'user',
        entityId: userId,
        metadata: { mode },
      });

      return { success: true };
    }),

  activeSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await ctx.db
      .select({
        id: session.id,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
      })
      .from(session)
      .where(eq(session.userId, ctx.session.user.id))
      .limit(50);

    return sessions;
  }),

  revokeSession: protectedProcedure
    .input(z.object({ sessionId: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      // Only allow revoking own sessions
      const [target] = await ctx.db
        .select({ userId: session.userId })
        .from(session)
        .where(eq(session.id, input.sessionId))
        .limit(1);

      if (!target || target.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      await ctx.db.delete(session).where(eq(session.id, input.sessionId));
      return { success: true };
    }),

  /** Capture affiliate referral after registration */
  captureReferral: protectedProcedure
    .input(z.object({ refCode: z.string().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const { captureReferral } = await import('@/server/lib/affiliates');
      await captureReferral(ctx.session.user.id, input.refCode);
      return { success: true };
    }),

  resendVerification: protectedProcedure.mutation(async ({ ctx }) => {
    const email = ctx.session.user.email;
    if (!email) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No email on account' });
    }

    try {
      await auth.api.sendVerificationEmail({
        body: { email },
      });
    } catch {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Please wait before requesting another verification email',
      });
    }

    return { success: true };
  }),

  revokeAllSessions: protectedProcedure.mutation(async ({ ctx }) => {
    // Get current session token to exclude it
    const currentSessionToken = ctx.headers.get('cookie')?.match(/better-auth\.session_token=([^;]+)/)?.[1];

    if (currentSessionToken) {
      // Delete all sessions except the current one
      const [currentSession] = await ctx.db
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.userId, ctx.session.user.id),
            eq(session.token, decodeURIComponent(currentSessionToken))
          )
        )
        .limit(1);

      if (currentSession) {
        await ctx.db
          .delete(session)
          .where(
            and(
              eq(session.userId, ctx.session.user.id),
              ne(session.id, currentSession.id)
            )
          );
        return { success: true };
      }
    }

    // Fallback: if we can't identify the current session, just delete all
    await ctx.db.delete(session).where(eq(session.userId, ctx.session.user.id));
    return { success: true };
  }),
});
