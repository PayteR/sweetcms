import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, ne } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { auth } from '@/lib/auth';
import { user, session, account } from '@/server/db/schema/auth';
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

  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Prevent staff from self-deleting via this endpoint
    const [targetUser] = await ctx.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!targetUser) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const { Policy } = await import('@/engine/policy');
    if (Policy.for(targetUser.role).canAccessAdmin()) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Staff accounts cannot be deleted via self-service. Contact an administrator.',
      });
    }

    // Delete sessions
    await ctx.db.delete(session).where(eq(session.userId, userId));

    // Delete accounts (OAuth, credentials)
    await ctx.db.delete(account).where(eq(account.userId, userId));

    // Anonymize user PII
    await ctx.db
      .update(user)
      .set({
        name: 'deleted_user',
        email: `deleted-${userId}@gdpr.invalid`,
        image: null,
        banned: true,
        banReason: 'Self-service account deletion',
        emailVerified: false,
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId));

    logAudit({
      db: ctx.db,
      userId,
      action: 'auth.deleteAccount',
      entityType: 'user',
      entityId: userId,
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
