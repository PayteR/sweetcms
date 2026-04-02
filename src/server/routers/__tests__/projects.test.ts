import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@/engine/lib/audit', () => ({
  logAudit: vi.fn(),
}));

import { asMock } from '@/test-utils';
import { projectsRouter } from '../projects';
import { logAudit } from '@/engine/lib/audit';

// Helper to build a mock DB with chainable select + insert + update
function createMockDb() {
  const returningMock = vi.fn().mockResolvedValue([]);
  const whereMock = vi.fn().mockReturnValue({ returning: returningMock, limit: vi.fn().mockResolvedValue([]) });
  const setMock = vi.fn().mockReturnValue({ where: whereMock, returning: returningMock });
  const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock, orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }) }) });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  return {
    select: selectMock,
    insert: vi.fn().mockReturnValue({ values: valuesMock }),
    update: vi.fn().mockReturnValue({ set: setMock }),
    _mocks: { selectMock, fromMock, whereMock, valuesMock, returningMock, setMock },
  };
}

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    session: {
      user: { id: 'user-1', email: 'test@test.com', role: 'admin' },
    },
    db: createMockDb(),
    headers: new Headers(),
    activeOrganizationId: 'org-1',
    ...overrides,
  };
}

describe('projectsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('throws when no active organization', async () => {
      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = projectsRouter.createCaller(ctx as never);

      await expect(caller.list()).rejects.toThrow('No active organization selected');
    });

    it('throws when user is not a member', async () => {
      const ctx = createMockCtx();
      // First select call is requireMember — returns empty (not a member)
      const limitMock = vi.fn().mockResolvedValue([]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      ctx.db.select = vi.fn().mockReturnValue({ from: fromMock });

      const caller = projectsRouter.createCaller(ctx as never);
      await expect(caller.list()).rejects.toThrow('Not a member of this organization');
    });
  });

  describe('create', () => {
    it('throws when no active organization', async () => {
      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = projectsRouter.createCaller(ctx as never);

      await expect(
        caller.create({ name: 'Test Project' }),
      ).rejects.toThrow('No active organization selected');
    });

    it('creates a project and logs audit', async () => {
      const ctx = createMockCtx();
      const project = { id: 'proj-1', name: 'Test Project', organizationId: 'org-1' };

      // requireMember returns a member
      let selectCallCount = 0;
      ctx.db.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // requireMember
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ id: 'member-1' }]),
              }),
            }),
          };
        }
        // count query for list
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        };
      });

      // insert returns project
      ctx.db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([project]),
        }),
      });

      const caller = projectsRouter.createCaller(ctx as never);
      const result = await caller.create({ name: 'Test Project' });

      expect(result).toEqual(project);
      expect(asMock(logAudit)).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.create',
          entityType: 'project',
          entityId: 'proj-1',
        }),
      );
    });
  });

  describe('get', () => {
    it('throws when project not found', async () => {
      const ctx = createMockCtx();
      let selectCallCount = 0;
      ctx.db.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ id: 'member-1' }]),
              }),
            }),
          };
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        };
      });

      const caller = projectsRouter.createCaller(ctx as never);
      await expect(
        caller.get({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }),
      ).rejects.toThrow('Project not found');
    });
  });

  describe('delete', () => {
    it('soft-deletes and logs audit', async () => {
      const ctx = createMockCtx();
      // requireMember
      ctx.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'member-1' }]),
          }),
        }),
      });

      // update returns the deleted project
      ctx.db.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }]),
          }),
        }),
      });

      const caller = projectsRouter.createCaller(ctx as never);
      const result = await caller.delete({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });

      expect(result).toEqual({ success: true });
      expect(asMock(logAudit)).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'project.delete',
          entityType: 'project',
        }),
      );
    });

    it('throws when project not found', async () => {
      const ctx = createMockCtx();
      ctx.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'member-1' }]),
          }),
        }),
      });

      ctx.db.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const caller = projectsRouter.createCaller(ctx as never);
      await expect(
        caller.delete({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }),
      ).rejects.toThrow('Project not found');
    });
  });

  describe('update', () => {
    it('throws when no active organization', async () => {
      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = projectsRouter.createCaller(ctx as never);

      await expect(
        caller.update({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Updated' }),
      ).rejects.toThrow('No active organization selected');
    });
  });
});
