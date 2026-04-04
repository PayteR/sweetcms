import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, asc, ne, inArray } from 'drizzle-orm';
import { createTRPCRouter, publicProcedure, sectionProcedure } from '../trpc';
import { saasChatSessions, saasChatMessages, saasTickets, saasTicketMessages } from '@/server/db/schema/support';
import { user } from '@/server/db/schema/auth';
import { parsePagination, paginatedResult } from '@/engine/crud/admin-crud';
import { sendNotification, sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/engine/types/notifications';
import { resolveOrgId } from '@/server/lib/resolve-org';
import { chatConfig } from '@/config/chat';
import { createLogger } from '@/engine/lib/logger';
import { getRedis } from '@/engine/lib/redis';
import { checkRateLimit } from '@/engine/lib/rate-limit';

const logger = createLogger('chat');

/** Stricter rate limit for chat messages: 20 per minute per IP */
const CHAT_RATE_LIMIT = { windowMs: 60_000, maxRequests: 20 };

async function applyChatRateLimit(headers: Headers): Promise<void> {
  const redis = getRedis();
  const ip = headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const result = await checkRateLimit(redis, `rl:chat:${ip}`, CHAT_RATE_LIMIT);
  if (!result.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Too many messages. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s`,
    });
  }
}

const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const ESCALATE_PREFIX = '[ESCALATE]';

/** Fire-and-forget WS broadcast */
function broadcastChatEvent(sessionId: string, type: string, payload: Record<string, unknown>): void {
  import('@/server/lib/ws')
    .then(({ broadcastToChannel }) => broadcastToChannel(`chat:${sessionId}`, type, { ...payload, type }))
    .catch(() => {/* WS not available */});
}

/** Call AI with conversation history, return assistant text */
async function callAI(messages: { role: string; body: string }[]): Promise<string | null> {
  const { env } = await import('@/lib/env');
  if (!env.AI_API_KEY) return null;

  const apiUrl = env.AI_API_URL ?? DEFAULT_API_URL;
  const model = chatConfig.model ?? env.AI_MODEL ?? DEFAULT_MODEL;

  const apiMessages = [
    { role: 'system', content: chatConfig.systemPrompt },
    ...messages.map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.body,
    })),
  ];

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => 'Unknown error');
      logger.error('Chat AI API error', { status: String(response.status), body: errBody });
      return null;
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    logger.error('Chat AI call failed', { error: String(err) });
    return null;
  }
}

/** Process AI response asynchronously — called fire-and-forget from sendMessage */
async function processAiResponse(db: typeof import('@/server/db').db, sessionId: string): Promise<void> {
  // Check message count for forced escalation
  const [msgCount] = await db
    .select({ count: count() })
    .from(saasChatMessages)
    .where(eq(saasChatMessages.sessionId, sessionId));

  if ((msgCount?.count ?? 0) >= chatConfig.maxMessagesBeforeEscalation) {
    await db
      .update(saasChatSessions)
      .set({ status: 'escalated' })
      .where(eq(saasChatSessions.id, sessionId));

    broadcastChatEvent(sessionId, 'chat_status', { sessionId, status: 'escalated' });
    return;
  }

  // Get conversation history
  const history = await db
    .select({ role: saasChatMessages.role, body: saasChatMessages.body })
    .from(saasChatMessages)
    .where(eq(saasChatMessages.sessionId, sessionId))
    .orderBy(asc(saasChatMessages.createdAt))
    .limit(50);

  const aiText = await callAI(history);
  if (!aiText) return; // AI unavailable

  const shouldEscalate = aiText.startsWith(ESCALATE_PREFIX);
  const cleanAiText = shouldEscalate
    ? aiText.slice(ESCALATE_PREFIX.length).trim() || chatConfig.escalationMessage
    : aiText;

  // Store AI message
  const aiMsgId = crypto.randomUUID();
  const aiNow = new Date();
  await db.insert(saasChatMessages).values({
    id: aiMsgId,
    sessionId,
    role: 'ai',
    body: cleanAiText,
    metadata: shouldEscalate ? { escalated: true } : undefined,
  });

  // Broadcast AI message via WS
  broadcastChatEvent(sessionId, 'chat_message', {
    id: aiMsgId,
    sessionId,
    role: 'ai',
    body: cleanAiText,
    createdAt: aiNow.toISOString(),
  });

  if (shouldEscalate) {
    await db
      .update(saasChatSessions)
      .set({ status: 'escalated' })
      .where(eq(saasChatSessions.id, sessionId));

    broadcastChatEvent(sessionId, 'chat_status', { sessionId, status: 'escalated' });
  }
}

const chatAdminProcedure = sectionProcedure('settings');

export const chatRouter = createTRPCRouter({
  // ─── Public procedures ──────────────────────────────────────────────────────

  /** Start or resume a chat session */
  startSession: publicProcedure
    .input(z.object({
      visitorId: z.string().min(1).max(100),
      email: z.string().email().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check for existing non-closed session for this visitor
      const [existing] = await ctx.db
        .select({
          id: saasChatSessions.id,
          status: saasChatSessions.status,
          ticketId: saasChatSessions.ticketId,
        })
        .from(saasChatSessions)
        .where(and(
          eq(saasChatSessions.visitorId, input.visitorId),
          ne(saasChatSessions.status, 'closed'),
        ))
        .orderBy(desc(saasChatSessions.createdAt))
        .limit(1);

      if (existing) {
        // Resume: return existing session + messages
        const messages = await ctx.db
          .select({
            id: saasChatMessages.id,
            role: saasChatMessages.role,
            body: saasChatMessages.body,
            createdAt: saasChatMessages.createdAt,
          })
          .from(saasChatMessages)
          .where(eq(saasChatMessages.sessionId, existing.id))
          .orderBy(asc(saasChatMessages.createdAt))
          .limit(100);

        return {
          id: existing.id,
          status: existing.status,
          ticketId: existing.ticketId,
          messages,
          resumed: true,
        };
      }

      // Create new session
      const userId = ctx.session?.user
        ? (ctx.session.user as unknown as { id: string }).id
        : undefined;

      const sessionId = crypto.randomUUID();
      await ctx.db.insert(saasChatSessions).values({
        id: sessionId,
        visitorId: input.visitorId,
        userId: userId ?? null,
        email: input.email ?? null,
        status: 'ai_active',
      });

      return { id: sessionId, status: 'ai_active' as const, messages: [], resumed: false };
    }),

  /** Send a message and get AI response */
  sendMessage: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      visitorId: z.string().min(1).max(100),
      body: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      // Chat-specific rate limit (20/min per IP, on top of global 100/min)
      await applyChatRateLimit(ctx.headers);

      // Verify session ownership
      const [session] = await ctx.db
        .select()
        .from(saasChatSessions)
        .where(and(
          eq(saasChatSessions.id, input.sessionId),
          eq(saasChatSessions.visitorId, input.visitorId),
        ))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Chat session not found' });
      }

      if (session.status === 'closed') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Chat session is closed' });
      }

      // Store user message
      const userMsgId = crypto.randomUUID();
      const now = new Date();
      await ctx.db.insert(saasChatMessages).values({
        id: userMsgId,
        sessionId: input.sessionId,
        role: 'user',
        body: input.body,
      });

      // Broadcast user message via WS (for admin monitoring)
      broadcastChatEvent(input.sessionId, 'chat_message', {
        id: userMsgId,
        sessionId: input.sessionId,
        role: 'user',
        body: input.body,
        createdAt: now.toISOString(),
      });

      // Skip AI for sessions already handled by human (agent or escalated)
      if (session.status === 'agent_active' || session.status === 'escalated') {
        return { userMessageId: userMsgId };
      }

      // Fire-and-forget: process AI response asynchronously so the HTTP response
      // returns immediately. AI response is delivered via WebSocket.
      processAiResponse(ctx.db, input.sessionId).catch((err) => {
        logger.error('AI response processing failed', { error: String(err), sessionId: input.sessionId });
      });

      return { userMessageId: userMsgId };
    }),

  /** Get session with messages (visitor-scoped) */
  getSession: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      visitorId: z.string().min(1).max(100),
    }))
    .query(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(saasChatSessions)
        .where(and(
          eq(saasChatSessions.id, input.sessionId),
          eq(saasChatSessions.visitorId, input.visitorId),
        ))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      const messages = await ctx.db
        .select({
          id: saasChatMessages.id,
          role: saasChatMessages.role,
          body: saasChatMessages.body,
          createdAt: saasChatMessages.createdAt,
        })
        .from(saasChatMessages)
        .where(eq(saasChatMessages.sessionId, input.sessionId))
        .orderBy(asc(saasChatMessages.createdAt))
        .limit(200);

      return { ...session, messages };
    }),

  /** Escalate chat — authenticated users get a ticket, anonymous users provide email for follow-up */
  escalate: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      visitorId: z.string().min(1).max(100),
      email: z.string().email().max(255).optional(),
      subject: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const authenticatedUser = ctx.session?.user
        ? (ctx.session.user as unknown as { id: string })
        : null;

      // Verify session ownership via visitorId (works for both auth and anon)
      const [session] = await ctx.db
        .select()
        .from(saasChatSessions)
        .where(and(
          eq(saasChatSessions.id, input.sessionId),
          eq(saasChatSessions.visitorId, input.visitorId),
        ))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      if (session.ticketId) {
        return { ticketId: session.ticketId, emailCaptured: false };
      }

      const subject = input.subject || session.subject || 'Chat support request';

      // ── Authenticated user: create ticket (existing flow) ─────────────────
      if (authenticatedUser) {
        const userId = authenticatedUser.id;
        const orgId = await resolveOrgId(
          (ctx as unknown as { activeOrganizationId?: string }).activeOrganizationId ?? null,
          userId,
        );

        const chatMessages = await ctx.db
          .select({ role: saasChatMessages.role, body: saasChatMessages.body, createdAt: saasChatMessages.createdAt })
          .from(saasChatMessages)
          .where(eq(saasChatMessages.sessionId, input.sessionId))
          .orderBy(asc(saasChatMessages.createdAt))
          .limit(200);

        const transcript = chatMessages
          .map((m) => `**${m.role === 'user' ? 'You' : m.role === 'ai' ? 'AI' : 'Agent'}** (${new Date(m.createdAt).toLocaleTimeString()}):\n${m.body}`)
          .join('\n\n---\n\n');

        const ticketId = crypto.randomUUID();

        await ctx.db.insert(saasTickets).values({
          id: ticketId,
          organizationId: orgId,
          userId,
          subject,
          status: 'open',
          priority: 'normal',
          source: 'chat',
          chatSessionId: input.sessionId,
        });

        await ctx.db.insert(saasTicketMessages).values({
          ticketId,
          userId,
          isStaff: false,
          body: `**Chat transcript:**\n\n${transcript}`,
        });

        await ctx.db
          .update(saasChatSessions)
          .set({ status: 'escalated', ticketId, subject })
          .where(eq(saasChatSessions.id, input.sessionId));

        sendOrgNotification(orgId, {
          title: 'Chat escalated to ticket',
          body: `Chat escalated: ${subject}`,
          type: NotificationType.INFO,
          category: NotificationCategory.SYSTEM,
          actionUrl: `/dashboard/settings/support/${ticketId}`,
        });

        broadcastChatEvent(input.sessionId, 'chat_status', {
          sessionId: input.sessionId,
          status: 'escalated',
          ticketId,
        });

        return { ticketId, emailCaptured: false };
      }

      // ── Anonymous user: capture email, escalate session (no ticket) ───────
      if (!input.email) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email is required for anonymous escalation' });
      }

      await ctx.db
        .update(saasChatSessions)
        .set({ status: 'escalated', email: input.email, subject })
        .where(eq(saasChatSessions.id, input.sessionId));

      broadcastChatEvent(input.sessionId, 'chat_status', {
        sessionId: input.sessionId,
        status: 'escalated',
      });

      return { ticketId: null, emailCaptured: true };
    }),

  /** Store email on an existing chat session (for pre-escalation capture) */
  setEmail: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      visitorId: z.string().min(1).max(100),
      email: z.string().email().max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select({ id: saasChatSessions.id })
        .from(saasChatSessions)
        .where(and(
          eq(saasChatSessions.id, input.sessionId),
          eq(saasChatSessions.visitorId, input.visitorId),
        ))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      await ctx.db
        .update(saasChatSessions)
        .set({ email: input.email })
        .where(eq(saasChatSessions.id, input.sessionId));

      return { success: true };
    }),

  /** Close a chat session (visitor-scoped) */
  close: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      visitorId: z.string().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select({ id: saasChatSessions.id })
        .from(saasChatSessions)
        .where(and(
          eq(saasChatSessions.id, input.sessionId),
          eq(saasChatSessions.visitorId, input.visitorId),
        ))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      await ctx.db
        .update(saasChatSessions)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(saasChatSessions.id, input.sessionId));

      broadcastChatEvent(input.sessionId, 'chat_status', {
        sessionId: input.sessionId,
        status: 'closed',
      });

      return { success: true };
    }),

  // ─── Admin procedures ───────────────────────────────────────────────────────

  /** List active chat sessions */
  adminList: chatAdminProcedure
    .input(z.object({
      status: z.enum(['ai_active', 'agent_active', 'escalated', 'closed']).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.status) {
        conditions.push(eq(saasChatSessions.status, input.status));
      } else {
        // Default: show non-closed sessions
        conditions.push(ne(saasChatSessions.status, 'closed'));
      }

      const where = and(...conditions);

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: saasChatSessions.id,
            visitorId: saasChatSessions.visitorId,
            userId: saasChatSessions.userId,
            email: saasChatSessions.email,
            status: saasChatSessions.status,
            subject: saasChatSessions.subject,
            ticketId: saasChatSessions.ticketId,
            createdAt: saasChatSessions.createdAt,
          })
          .from(saasChatSessions)
          .where(where)
          .orderBy(desc(saasChatSessions.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(saasChatSessions).where(where),
      ]);

      // Enrich with user info — only fetch relevant users
      const userIds = [...new Set(items.map((i) => i.userId).filter(Boolean) as string[])];
      let userMap: Record<string, { name: string | null; email: string }> = {};
      if (userIds.length > 0) {
        const users = await ctx.db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(inArray(user.id, userIds))
          .limit(100);
        userMap = Object.fromEntries(users.map((u) => [u.id, { name: u.name, email: u.email }]));
      }

      // Batch fetch last message for each session (single query instead of N+1)
      const sessionIds = items.map((i) => i.id);
      let lastMessageMap: Record<string, { body: string; role: string; createdAt: Date }> = {};
      if (sessionIds.length > 0) {
        // Fetch latest message per session — one query per page (bounded by pageSize)
        const lastMsgRows = await Promise.all(
          sessionIds.map((sid) =>
            ctx.db
              .select({ sessionId: saasChatMessages.sessionId, body: saasChatMessages.body, role: saasChatMessages.role, createdAt: saasChatMessages.createdAt })
              .from(saasChatMessages)
              .where(eq(saasChatMessages.sessionId, sid))
              .orderBy(desc(saasChatMessages.createdAt))
              .limit(1)
              .then((rows) => rows[0] ?? null)
          )
        );
        for (const row of lastMsgRows) {
          if (row) {
            lastMessageMap[row.sessionId] = {
              body: row.body,
              role: row.role,
              createdAt: row.createdAt,
            };
          }
        }
      }

      const enriched = items.map((item) => {
        const lastMsg = lastMessageMap[item.id];
        return {
          ...item,
          userName: item.userId ? userMap[item.userId]?.name ?? null : null,
          userEmail: item.userId ? userMap[item.userId]?.email ?? null : null,
          lastMessage: lastMsg
            ? { body: lastMsg.body.slice(0, 100), role: lastMsg.role, createdAt: lastMsg.createdAt }
            : null,
        };
      });

      return paginatedResult(enriched, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get chat session with all messages (admin) */
  adminGet: chatAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(saasChatSessions)
        .where(eq(saasChatSessions.id, input.id))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      const messages = await ctx.db
        .select({
          id: saasChatMessages.id,
          role: saasChatMessages.role,
          body: saasChatMessages.body,
          metadata: saasChatMessages.metadata,
          createdAt: saasChatMessages.createdAt,
        })
        .from(saasChatMessages)
        .where(eq(saasChatMessages.sessionId, input.id))
        .orderBy(asc(saasChatMessages.createdAt))
        .limit(200);

      // Get user info if available
      let creator = null;
      if (session.userId) {
        const [u] = await ctx.db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, session.userId))
          .limit(1);
        creator = u ?? null;
      }

      return { ...session, messages, creator };
    }),

  /** Admin sends a message in a chat session (takes over from AI) */
  adminReply: chatAdminProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      body: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select()
        .from(saasChatSessions)
        .where(eq(saasChatSessions.id, input.sessionId))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      if (session.status === 'closed') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Session is closed' });
      }

      const messageId = crypto.randomUUID();
      const now = new Date();

      await ctx.db.insert(saasChatMessages).values({
        id: messageId,
        sessionId: input.sessionId,
        role: 'agent',
        body: input.body,
      });

      // Transition to agent_active if AI was handling
      if (session.status === 'ai_active' || session.status === 'escalated') {
        await ctx.db
          .update(saasChatSessions)
          .set({ status: 'agent_active' })
          .where(eq(saasChatSessions.id, input.sessionId));
      }

      // Broadcast message to chat channel
      broadcastChatEvent(input.sessionId, 'chat_message', {
        id: messageId,
        sessionId: input.sessionId,
        role: 'agent',
        body: input.body,
        createdAt: now.toISOString(),
      });

      // Notify user if they have an account
      if (session.userId) {
        sendNotification({
          userId: session.userId,
          title: 'New message from support',
          body: input.body.slice(0, 100),
          type: NotificationType.INFO,
          category: NotificationCategory.SYSTEM,
          actionUrl: `/account/support`,
        });
      }

      return { id: messageId };
    }),

  /** Admin closes a chat session */
  adminClose: chatAdminProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(saasChatSessions)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(saasChatSessions.id, input.sessionId));

      broadcastChatEvent(input.sessionId, 'chat_status', {
        sessionId: input.sessionId,
        status: 'closed',
      });

      return { success: true };
    }),

  /** Get chat stats (admin) */
  getStats: chatAdminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        status: saasChatSessions.status,
        count: count(),
      })
      .from(saasChatSessions)
      .groupBy(saasChatSessions.status);

    const stats: Record<string, number> = { total: 0 };
    for (const row of rows) {
      stats[row.status] = row.count;
      stats.total += row.count;
    }
    return stats;
  }),
});
