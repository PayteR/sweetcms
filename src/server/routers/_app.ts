import { createTRPCRouter } from '../trpc';
import { authRouter } from './auth';
import { categoriesRouter } from './categories';
import { cmsRouter } from './cms';
import { contentSearchRouter } from './content-search';
import { mediaRouter } from './media';
import { optionsRouter } from './options';
import { revisionsRouter } from './revisions';
import { usersRouter } from './users';

/**
 * Root tRPC router — combines all sub-routers
 */
export const appRouter = createTRPCRouter({
  auth: authRouter,
  cms: cmsRouter,
  categories: categoriesRouter,
  contentSearch: contentSearchRouter,
  media: mediaRouter,
  options: optionsRouter,
  revisions: revisionsRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
