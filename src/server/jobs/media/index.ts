import { eq } from 'drizzle-orm';

import { createQueue, createWorker } from '@/engine/lib/queue';
import { enqueue } from '@/engine/lib/queue-adapter';
import { processImage } from '@/engine/lib/media-processing';
import { getStorage } from '@/engine/storage';
import { createLogger } from '@/engine/lib/logger';
import { FileType } from '@/engine/types/cms';
import { db } from '@/server/db';
import { cmsMedia } from '@/server/db/schema';

const log = createLogger('media-worker');

const _mediaQueue = createQueue('media-processing');

interface MediaProcessingPayload {
  mediaId: string;
}

/**
 * Enqueue a media file for processing (thumbnail, medium, WebP, blur).
 * Only enqueues image files.
 */
export async function enqueueMediaProcessing(
  mediaId: string,
  mimeType: string
): Promise<void> {
  if (!mimeType.startsWith('image/')) return;

  // Skip SVGs — they don't benefit from raster processing
  if (mimeType === 'image/svg+xml') return;

  await enqueue('media-processing', { mediaId } satisfies MediaProcessingPayload);
}

async function processMediaJob(payload: MediaProcessingPayload): Promise<void> {
  const [media] = await db
    .select()
    .from(cmsMedia)
    .where(eq(cmsMedia.id, payload.mediaId))
    .limit(1);

  if (!media) {
    log.warn('Media not found, skipping', { mediaId: payload.mediaId });
    return;
  }

  if (media.fileType !== FileType.IMAGE) {
    return;
  }

  // Already processed
  if (media.thumbnailPath && media.mediumPath && media.blurDataUrl) {
    return;
  }

  const storage = getStorage();

  let buffer: Buffer;
  try {
    buffer = await storage.download(media.filepath);
  } catch (err) {
    log.error('Failed to download media file', {
      mediaId: media.id,
      filepath: media.filepath,
      error: String(err),
    });
    return;
  }

  const result = await processImage(buffer);

  // Derive paths from the original filepath
  const dir = media.filepath.substring(0, media.filepath.lastIndexOf('/'));
  const baseName = media.id;

  const thumbPath = `${dir}/thumb-${baseName}.webp`;
  const mediumPath = `${dir}/medium-${baseName}.webp`;

  // Upload generated variants
  await Promise.all([
    storage.upload(thumbPath, result.thumbnail),
    storage.upload(mediumPath, result.medium),
  ]);

  // Update the media record
  await db
    .update(cmsMedia)
    .set({
      thumbnailPath: thumbPath,
      mediumPath: mediumPath,
      blurDataUrl: result.blurDataUrl,
    })
    .where(eq(cmsMedia.id, media.id));

  log.info('Media processed', {
    mediaId: media.id,
    thumbPath,
    mediumPath,
  });
}

export function startMediaWorker(): void {
  createWorker('media-processing', async (job) => {
    await processMediaJob(job.data as MediaProcessingPayload);
  });
  log.info('Media processing worker started');
}
