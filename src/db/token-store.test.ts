import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PrismaClient before importing the module
vi.mock('@prisma/client', () => {
  const mockFindUnique = vi.fn();
  const mockUpsert = vi.fn();
  const mockDelete = vi.fn();
  const mockDisconnect = vi.fn();

  const MockPrismaClient = vi.fn().mockImplementation(() => ({
    userToken: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
      delete: mockDelete,
    },
    $disconnect: mockDisconnect,
  }));

  return { PrismaClient: MockPrismaClient };
});

import { getUserToken, saveUserToken, deleteUserToken, getPrismaClient, disconnectPrisma } from './token-store.js';
import { PrismaClient } from '@prisma/client';

describe('token-store', () => {
  let mockPrisma: ReturnType<typeof getPrismaClient>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset singleton so each test gets a fresh mock
    await disconnectPrisma();
    mockPrisma = getPrismaClient();
  });

  describe('getUserToken', () => {
    it('returns token when user exists', async () => {
      (mockPrisma.userToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ token: 'xoxp-test-token' });

      const result = await getUserToken('U12345');
      expect(result.success).toBe(true);
      expect(result.data).toBe('xoxp-test-token');
      expect(result.error).toBeNull();
    });

    it('returns null data when user not found', async () => {
      (mockPrisma.userToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getUserToken('U99999');
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('returns fail envelope on database error', async () => {
      (mockPrisma.userToken.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB connection failed'));

      const result = await getUserToken('U12345');
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toContain('Failed to retrieve user token');
    });
  });

  describe('saveUserToken', () => {
    it('upserts a user token successfully', async () => {
      (mockPrisma.userToken.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await saveUserToken('U12345', 'xoxp-token', 'T12345', 'search:read');
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeNull();

      expect(mockPrisma.userToken.upsert).toHaveBeenCalledWith({
        where: { userId: 'U12345' },
        create: { userId: 'U12345', token: 'xoxp-token', teamId: 'T12345', scopes: 'search:read' },
        update: { token: 'xoxp-token', teamId: 'T12345', scopes: 'search:read' },
      });
    });

    it('returns fail envelope on database error', async () => {
      (mockPrisma.userToken.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Constraint violated'));

      const result = await saveUserToken('U12345', 'xoxp-token', 'T12345', 'search:read');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to save user token');
    });
  });

  describe('deleteUserToken', () => {
    it('deletes a user token successfully', async () => {
      (mockPrisma.userToken.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const result = await deleteUserToken('U12345');
      expect(result.success).toBe(true);
    });

    it('returns fail envelope on database error', async () => {
      (mockPrisma.userToken.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));

      const result = await deleteUserToken('U12345');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to delete user token');
    });
  });

  describe('getPrismaClient singleton', () => {
    it('returns the same instance on multiple calls', () => {
      const a = getPrismaClient();
      const b = getPrismaClient();
      expect(a).toBe(b);
    });
  });
});
