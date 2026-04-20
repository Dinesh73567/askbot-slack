import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPoll,
  updatePollMessageTs,
  getPollById,
  toggleVote,
  getVotesForPoll,
  closePoll,
} from './poll-store.js';

// Mock the Prisma client
const mockPrisma = {
  poll: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  pollVote: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('../db/token-store.js', () => ({
  getPrismaClient: () => mockPrisma,
}));

const MOCK_POLL = {
  id: 'poll-1',
  channelId: 'C123',
  messageTs: null,
  creatorId: 'U001',
  question: 'Lunch?',
  options: ['Pizza', 'Sushi'],
  mode: 'multi',
  closedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createPoll', () => {
  it('creates a single-select poll by default', async () => {
    mockPrisma.poll.create.mockResolvedValue({ ...MOCK_POLL, mode: 'single' });

    const result = await createPoll('C123', 'U001', 'Lunch?', ['Pizza', 'Sushi']);

    expect(result.success).toBe(true);
    expect(result.data?.mode).toBe('single');
    expect(mockPrisma.poll.create).toHaveBeenCalledWith({
      data: {
        channelId: 'C123',
        creatorId: 'U001',
        question: 'Lunch?',
        options: ['Pizza', 'Sushi'],
        mode: 'single',
      },
    });
  });

  it('creates a single-select poll', async () => {
    mockPrisma.poll.create.mockResolvedValue({ ...MOCK_POLL, mode: 'single' });

    const result = await createPoll('C123', 'U001', 'Lunch?', ['Pizza', 'Sushi'], 'single');

    expect(result.success).toBe(true);
    expect(result.data?.mode).toBe('single');
    expect(mockPrisma.poll.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mode: 'single' }),
    });
  });

  it('returns fail envelope on database error', async () => {
    mockPrisma.poll.create.mockRejectedValue(new Error('DB down'));

    const result = await createPoll('C123', 'U001', 'Q?', ['A', 'B']);

    expect(result.success).toBe(false);
    expect(result.error).toContain('DB down');
  });
});

describe('updatePollMessageTs', () => {
  it('updates the message timestamp', async () => {
    mockPrisma.poll.update.mockResolvedValue({ ...MOCK_POLL, messageTs: '123.456' });

    const result = await updatePollMessageTs('poll-1', '123.456');

    expect(result.success).toBe(true);
    expect(mockPrisma.poll.update).toHaveBeenCalledWith({
      where: { id: 'poll-1' },
      data: { messageTs: '123.456' },
    });
  });
});

describe('getPollById', () => {
  it('returns poll data when found', async () => {
    mockPrisma.poll.findUnique.mockResolvedValue(MOCK_POLL);

    const result = await getPollById('poll-1');

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('poll-1');
    expect(result.data?.mode).toBe('multi');
  });

  it('returns null when not found', async () => {
    mockPrisma.poll.findUnique.mockResolvedValue(null);

    const result = await getPollById('nonexistent');

    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });
});

describe('toggleVote', () => {
  it('adds a vote when none exists (multi)', async () => {
    mockPrisma.pollVote.findUnique.mockResolvedValue(null);
    mockPrisma.pollVote.create.mockResolvedValue({ id: 'vote-1' });

    const result = await toggleVote('poll-1', 0, 'U001', 'multi');

    expect(result.success).toBe(true);
    expect(result.data?.added).toBe(true);
    expect(mockPrisma.pollVote.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.pollVote.create).toHaveBeenCalled();
  });

  it('removes a vote when one exists', async () => {
    mockPrisma.pollVote.findUnique.mockResolvedValue({ id: 'vote-1' });
    mockPrisma.pollVote.delete.mockResolvedValue({});

    const result = await toggleVote('poll-1', 0, 'U001', 'multi');

    expect(result.success).toBe(true);
    expect(result.data?.added).toBe(false);
    expect(mockPrisma.pollVote.delete).toHaveBeenCalledWith({
      where: { id: 'vote-1' },
    });
  });

  it('removes other votes before adding in single-select mode', async () => {
    mockPrisma.pollVote.findUnique.mockResolvedValue(null);
    mockPrisma.pollVote.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.pollVote.create.mockResolvedValue({ id: 'vote-2' });

    const result = await toggleVote('poll-1', 1, 'U001', 'single');

    expect(result.success).toBe(true);
    expect(result.data?.added).toBe(true);
    expect(mockPrisma.pollVote.deleteMany).toHaveBeenCalledWith({
      where: { pollId: 'poll-1', userId: 'U001' },
    });
    expect(mockPrisma.pollVote.create).toHaveBeenCalled();
  });

  it('toggle off in single mode does not call deleteMany', async () => {
    mockPrisma.pollVote.findUnique.mockResolvedValue({ id: 'vote-1' });
    mockPrisma.pollVote.delete.mockResolvedValue({});

    const result = await toggleVote('poll-1', 0, 'U001', 'single');

    expect(result.success).toBe(true);
    expect(result.data?.added).toBe(false);
    expect(mockPrisma.pollVote.deleteMany).not.toHaveBeenCalled();
  });

  it('returns fail on database error', async () => {
    mockPrisma.pollVote.findUnique.mockRejectedValue(new Error('connection lost'));

    const result = await toggleVote('poll-1', 0, 'U001');

    expect(result.success).toBe(false);
    expect(result.error).toContain('connection lost');
  });
});

describe('getVotesForPoll', () => {
  it('returns all votes for a poll', async () => {
    mockPrisma.pollVote.findMany.mockResolvedValue([
      { optionIndex: 0, userId: 'U001' },
      { optionIndex: 1, userId: 'U002' },
    ]);

    const result = await getVotesForPoll('poll-1');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });
});

describe('closePoll', () => {
  it('sets closedAt on the poll', async () => {
    mockPrisma.poll.update.mockResolvedValue({
      ...MOCK_POLL,
      closedAt: new Date(),
    });

    const result = await closePoll('poll-1');

    expect(result.success).toBe(true);
    expect(mockPrisma.poll.update).toHaveBeenCalledWith({
      where: { id: 'poll-1' },
      data: { closedAt: expect.any(Date) },
    });
  });
});
