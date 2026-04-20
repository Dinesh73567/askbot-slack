import { getPrismaClient } from '../db/token-store.js';
import type { Envelope, PollData, PollMode, PollVoteRecord } from '../types/index.js';
import { ok, fail } from '../utils/envelope.js';

/**
 * Map a Prisma poll record to PollData.
 */
function toPollData(record: {
  id: string;
  channelId: string;
  messageTs: string | null;
  creatorId: string;
  question: string;
  options: string[];
  mode: string;
  closedAt: Date | null;
  createdAt: Date;
}): PollData {
  return {
    id: record.id,
    channelId: record.channelId,
    messageTs: record.messageTs,
    creatorId: record.creatorId,
    question: record.question,
    options: record.options,
    mode: record.mode as PollMode,
    closedAt: record.closedAt,
    createdAt: record.createdAt,
  };
}

/**
 * Create a new poll in the database.
 */
export async function createPoll(
  channelId: string,
  creatorId: string,
  question: string,
  options: readonly string[],
  mode: PollMode = 'single',
): Promise<Envelope<PollData>> {
  try {
    const prisma = getPrismaClient();
    const record = await prisma.poll.create({
      data: {
        channelId,
        creatorId,
        question,
        options: [...options],
        mode,
      },
    });
    return ok(toPollData(record));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(`Failed to create poll: ${message}`);
  }
}

/**
 * Update the Slack message timestamp after posting.
 */
export async function updatePollMessageTs(
  pollId: string,
  messageTs: string,
): Promise<Envelope<void>> {
  try {
    const prisma = getPrismaClient();
    await prisma.poll.update({
      where: { id: pollId },
      data: { messageTs },
    });
    return ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(`Failed to update poll message timestamp: ${message}`);
  }
}

/**
 * Get a poll by ID.
 */
export async function getPollById(
  pollId: string,
): Promise<Envelope<PollData | null>> {
  try {
    const prisma = getPrismaClient();
    const record = await prisma.poll.findUnique({
      where: { id: pollId },
    });
    if (!record) return ok(null);
    return ok(toPollData(record));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(`Failed to get poll: ${message}`);
  }
}

/**
 * Toggle a vote: add if not present, remove if already voted.
 * For single-select polls, removes any existing vote by this user first.
 * Returns whether the vote was added or removed.
 */
export async function toggleVote(
  pollId: string,
  optionIndex: number,
  userId: string,
  mode: PollMode = 'single',
): Promise<Envelope<{ readonly added: boolean }>> {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.pollVote.findUnique({
      where: {
        pollId_optionIndex_userId: { pollId, optionIndex, userId },
      },
    });

    // If already voted for this option, remove it (toggle off)
    if (existing) {
      await prisma.pollVote.delete({ where: { id: existing.id } });
      return ok({ added: false });
    }

    // For single-select, remove any other votes by this user first
    if (mode === 'single') {
      await prisma.pollVote.deleteMany({
        where: { pollId, userId },
      });
    }

    await prisma.pollVote.create({
      data: { pollId, optionIndex, userId },
    });
    return ok({ added: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(`Failed to toggle vote: ${message}`);
  }
}

/**
 * Get all votes for a poll.
 */
export async function getVotesForPoll(
  pollId: string,
): Promise<Envelope<readonly PollVoteRecord[]>> {
  try {
    const prisma = getPrismaClient();
    const records = await prisma.pollVote.findMany({
      where: { pollId },
      select: { optionIndex: true, userId: true },
    });
    return ok(records);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(`Failed to get votes: ${message}`);
  }
}

/**
 * Close a poll so no more votes can be cast.
 */
export async function closePoll(pollId: string): Promise<Envelope<void>> {
  try {
    const prisma = getPrismaClient();
    await prisma.poll.update({
      where: { id: pollId },
      data: { closedAt: new Date() },
    });
    return ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(`Failed to close poll: ${message}`);
  }
}
