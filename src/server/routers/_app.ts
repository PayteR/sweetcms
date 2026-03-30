import { createTRPCRouter } from '../trpc';
import { analyticsRouter } from './analytics';
import { auditRouter } from './audit';
import { authRouter } from './auth';
import { categoriesRouter } from './categories';
import { cmsRouter } from './cms';
import { contentSearchRouter } from './content-search';
import { customFieldsRouter } from './custom-fields';
import { formsRouter } from './forms';
import { importRouter } from './import';
import { jobQueueRouter } from './job-queue';
import { mediaRouter } from './media';
import { menusRouter } from './menus';
import { optionsRouter } from './options';
import { redirectsRouter } from './redirects';
import { revisionsRouter } from './revisions';
import { tagsRouter } from './tags';
import { usersRouter } from './users';
import { webhooksRouter } from './webhooks';

/**
 * Root tRPC router — combines all sub-routers
 */
export const appRouter = createTRPCRouter({
  analytics: analyticsRouter,
  audit: auditRouter,
  auth: authRouter,
  cms: cmsRouter,
  categories: categoriesRouter,
  contentSearch: contentSearchRouter,
  customFields: customFieldsRouter,
  forms: formsRouter,
  import: importRouter,
  jobQueue: jobQueueRouter,
  media: mediaRouter,
  menus: menusRouter,
  options: optionsRouter,
  redirects: redirectsRouter,
  revisions: revisionsRouter,
  tags: tagsRouter,
  users: usersRouter,
  webhooks: webhooksRouter,
});

export type AppRouter = typeof appRouter;
