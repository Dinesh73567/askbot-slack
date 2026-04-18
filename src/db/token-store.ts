import { PrismaClient } from '@prisma/client';
import type { Envelope } from '../types/index.js';
import { ok, fail } from '../utils/envelope.js';

// Singleton PrismaClient instance
let prismaInstance: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

/**
 * Retrieve a stored user token by Slack user ID.
 * Returns the xoxp- token string if found, null if not found.
 */
export async function getUserToken(userId: string): Promise<Envelope<string | null>> {
  try {
    const prisma = getPrismaClient();
    const record = await prisma.userToken.findUnique({
      where: { userId },
      select: { token: true },
    });
    // Log only the presence, never the token value
    return ok(record?.token ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(`Failed to retrieve user token: ${message}`);
  }
}

/**
 * Save or update a user's OAuth token.
 * Uses upsert so re-authorization replaces the old token.
 */
export async function saveUserToken(
  userId: string,
  token: string,
  teamId: string,
  scopes: string,
): Promise<Envelope<void>> {
  try {
    const prisma = getPrismaClient();
    await prisma.userToken.upsert({
      where: { userId },
      create: { userId, token, teamId, scopes },
      update: { token, teamId, scopes },
    });
    return ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(`Failed to save user token: ${message}`);
  }
}

/**
 * Remove a user's stored token (e.g., on revocation).
 */
export async function deleteUserToken(userId: string): Promise<Envelope<void>> {
  try {
    const prisma = getPrismaClient();
    await prisma.userToken.delete({
      where: { userId },
    });
    return ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(`Failed to delete user token: ${message}`);
  }
}
