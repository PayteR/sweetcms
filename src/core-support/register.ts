/**
 * core-support module registration entrypoint.
 *
 * Re-exports everything needed to wire this module into a project:
 * - Router: add to your _app.ts
 * - Schema: re-export from your schema/index.ts
 * - Jobs: start worker from server.ts
 * - Config: override defaults in your project config
 * - Components: use in your app layer
 */

// Routers
export { supportChatRouter } from './routers/support-chat';
export { supportRouter } from './routers/support';

// Schema
export { saasSupportChatSessions, saasSupportChatMessages } from './schema/support-chat';
export { saasTickets, saasTicketMessages } from './schema/support-tickets';

// Jobs
export { startSupportChatCleanupWorker, cleanupStaleSessions } from './jobs/support-chat';

// Config
export { supportChatConfig, setChatConfig } from './config';
export type { SupportChatConfig } from './config';

// Dependencies (call setChatDeps at startup)
export { setChatDeps, getChatDeps } from './deps';
export type { ChatDeps, EscalationResult, UserInfo } from './deps';

// Components
export { SupportChatWidget } from './components/SupportChatWidget';
