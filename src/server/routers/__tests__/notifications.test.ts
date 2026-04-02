import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/engine/lib/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/server/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

import { notificationsRouter } from '../notifications';

// Helper to build mock DB with chainable query builders
function createMockDb() {
  // For select queries
  const selectLimitMock = vi.fn().mockResolvedValue([]);
  const selectOrderByMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
  const selectWhereMock = vi.fn().mockReturnValue({
    orderBy: selectOrderByMock,
    limit: selectLimitMock,
  });
  const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  // For update queries
  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  // For delete queries
  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

  return {
    select: selectMock,
    update: updateMock,
    delete: deleteMock,
    _chains: {
      select: { from: selectFromMock, where: selectWhereMock, orderBy: selectOrderByMock, limit: selectLimitMock },
      update: { set: updateSetMock, where: updateWhereMock },
      delete: { where: deleteWhereMock },
    },
  };
}

function createMockCtx(dbOverrides?: ReturnType<typeof createMockDb>) {
  const db = dbOverrides ?? createMockDb();
  return {
    session: {
      user: { id: 'user-1', email: 'test@test.com', role: 'user' },
    },
    db,
    headers: new Headers(),
    activeOrganizationId: null,
  };
}

describe('notificationsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('returns empty list when user has no notifications', async () => {
      const db = createMockDb();
      db._chains.select.limit.mockResolvedValue([]);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.list({});

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it('returns notifications with pagination', async () => {
      const db = createMockDb();
      const notifications = Array.from({ length: 21 }, (_, i) => ({
        id: `notif-${i}`,
        userId: 'user-1',
        title: `Notification ${i}`,
        body: `Body ${i}`,
        type: 'info',
        category: 'system',
        read: false,
        createdAt: new Date(),
      }));
      // Return 21 items (limit + 1) to signal hasMore
      db._chains.select.limit.mockResolvedValue(notifications);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.list({ limit: 20 });

      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();
    });

    it('returns hasMore=false when fewer items than limit', async () => {
      const db = createMockDb();
      const notifications = [
        { id: 'notif-1', userId: 'user-1', title: 'Test', body: 'Body', type: 'info', category: 'system', read: false, createdAt: new Date() },
      ];
      db._chains.select.limit.mockResolvedValue(notifications);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.list({ limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it('respects default limit of 20', async () => {
      const db = createMockDb();
      db._chains.select.limit.mockResolvedValue([]);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      await caller.list({});

      // The limit passed to DB is input.limit + 1 = 21
      expect(db._chains.select.limit).toHaveBeenCalledWith(21);
    });
  });

  describe('unreadCount', () => {
    it('returns 0 when no unread notifications', async () => {
      const db = createMockDb();
      db._chains.select.limit.mockResolvedValue([{ count: 0 }]);
      // For unreadCount, the chain is select().from().where() — no orderBy or limit
      // Need to mock the where to return the result directly
      db._chains.select.where.mockResolvedValue([{ count: 0 }]);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.unreadCount();

      expect(result).toBe(0);
    });

    it('returns count of unread notifications', async () => {
      const db = createMockDb();
      db._chains.select.where.mockResolvedValue([{ count: 5 }]);
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.unreadCount();

      expect(result).toBe(5);
    });
  });

  describe('markRead', () => {
    it('marks a notification as read', async () => {
      const db = createMockDb();
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.markRead({ id: 'notif-1' });

      expect(result).toEqual({ success: true });
      expect(db.update).toHaveBeenCalled();
      expect(db._chains.update.set).toHaveBeenCalledWith({
        read: true,
        readAt: expect.any(Date),
      });
    });
  });

  describe('markAllRead', () => {
    it('marks all unread notifications as read', async () => {
      const db = createMockDb();
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.markAllRead();

      expect(result).toEqual({ success: true });
      expect(db.update).toHaveBeenCalled();
      expect(db._chains.update.set).toHaveBeenCalledWith({
        read: true,
        readAt: expect.any(Date),
      });
    });
  });

  describe('delete', () => {
    it('deletes a notification', async () => {
      const db = createMockDb();
      const ctx = createMockCtx(db);

      const caller = notificationsRouter.createCaller(ctx as never);
      const result = await caller.delete({ id: 'notif-1' });

      expect(result).toEqual({ success: true });
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
