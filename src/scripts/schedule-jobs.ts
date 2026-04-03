/**
 * Register BullMQ repeatable job schedules.
 *
 * Run after deploy (idempotent — safe to run multiple times):
 *   bun run src/scripts/schedule-jobs.ts
 */

import { createQueue } from '@/engine/lib/queue';

async function main() {
  const contentQueue = createQueue('content-publish');
  if (!contentQueue) {
    console.log('No Redis — skipping job scheduling');
    process.exit(0);
  }

  // Content publish check every 60 seconds
  await contentQueue.upsertJobScheduler('content-publish', {
    every: 60_000,
  });

  console.log('Job schedules registered');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to schedule jobs:', err);
  process.exit(1);
});
