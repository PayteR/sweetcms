import { and, eq, lt } from 'drizzle-orm';

import { createQueue, createWorker } from '@/engine/lib/queue';
import { db } from '@/server/db';
import { saasChatSessions } from '@/server/db/schema/support';
import { createLogger } from '@/engine/lib/logger';

const logger = createLogger('chat-cleanup');
const _chatQueue = createQueue('chat-cleanup');

/** Close stale chat sessions older than 24 hours */
export async function cleanupStaleSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const stale = await db
    .select({ id: saasChatSessions.id })
    .from(saasChatSessions)
    .where(
      and(
        eq(saasChatSessions.status, 'ai_active'),
        lt(saasChatSessions.createdAt, cutoff),
      )
    )
    .limit(100);

  if (stale.length === 0) return;

  const now = new Date();
  for (const session of stale) {
    await db
      .update(saasChatSessions)
      .set({ status: 'closed', closedAt: now })
      .where(eq(saasChatSessions.id, session.id));
  }

  logger.info(`Closed ${stale.length} stale chat sessions`);
}

/** Start the chat cleanup worker (called from server.ts) */
export function startChatCleanupWorker(): void {
  createWorker('chat-cleanup', async () => {
    await cleanupStaleSessions();
  });
}
