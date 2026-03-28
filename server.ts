import { createServer } from 'http';
import next from 'next';
import { parse } from 'url';

/**
 * Custom Next.js Server with BullMQ Support
 *
 * SERVER_ROLE controls which subsystems are initialized:
 *   "all"      (default) — Next.js + tRPC + BullMQ
 *   "frontend" — Next.js pages only (no BullMQ)
 *   "api"      — Next.js + tRPC (no BullMQ)
 *   "worker"   — BullMQ only (no Next.js)
 */

type ServerRole = 'all' | 'frontend' | 'api' | 'worker';
const VALID_ROLES: ServerRole[] = ['all', 'frontend', 'api', 'worker'];

const role = (process.env.SERVER_ROLE || 'all') as ServerRole;
if (!VALID_ROLES.includes(role)) {
  console.error(
    `Invalid SERVER_ROLE="${role}". Must be one of: ${VALID_ROLES.join(', ')}`
  );
  process.exit(1);
}

const enableNextjs = role !== 'worker';
const enableWorkers = role === 'all' || role === 'worker';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

async function main() {
  let handle:
    | ((
        req: import('http').IncomingMessage,
        res: import('http').ServerResponse,
        parsedUrl?: import('url').UrlWithParsedQuery
      ) => Promise<void>)
    | null = null;

  if (enableNextjs) {
    const app = next({ dev, hostname, port, turbopack: dev });
    handle = app.getRequestHandler();
    await app.prepare();
  }

  const server = createServer(async (req, res) => {
    try {
      if (handle) {
        const parsedUrl = parse(req.url || '', true);
        await handle(req, res, parsedUrl);
      } else {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Worker-only mode — no HTTP endpoints.');
      }
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Initialize BullMQ workers
  if (enableWorkers) {
    const { startEmailWorker } = await import('./src/server/jobs/email/index');
    startEmailWorker();
    console.log('BullMQ workers ready (email worker started)');
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down gracefully...');
    const { shutdownAllWorkers } = await import('./src/server/jobs/queue');
    await shutdownAllWorkers();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(port, () => {
    const features = [
      enableNextjs ? 'Next.js' : null,
      enableWorkers ? 'BullMQ' : null,
    ]
      .filter(Boolean)
      .join(' + ');

    console.log(`
  Server Ready
  URL: http://${hostname}:${port}
  Role: ${role}
  Features: ${features}
  Environment: ${dev ? 'Development' : 'Production'}
    `);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use`);
      process.exit(1);
    } else {
      throw err;
    }
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
