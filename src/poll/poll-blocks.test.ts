import { describe, it, expect } from 'vitest';
import { buildPollBlocks, buildClosePollBlocks } from './poll-blocks.js';
import type { PollState, PollMode } from '../types/index.js';

function makePollState(overrides: Partial<{
  closedAt: Date | null;
  votes: PollState['votes'];
  mode: PollMode;
}>): PollState {
  return {
    poll: {
      id: 'poll-1',
      channelId: 'C123',
      messageTs: '1234.5678',
      creatorId: 'U001',
      question: 'What for lunch?',
      options: ['Pizza', 'Sushi', 'Tacos'],
      mode: overrides.mode ?? 'multi',
      closedAt: overrides.closedAt ?? null,
      createdAt: new Date('2026-01-01'),
    },
    votes: overrides.votes ?? [],
    voterNames: new Map(),
  };
}

describe('buildPollBlocks', () => {
  it('renders an open multi-select poll with no votes', () => {
    const state = makePollState({});
    const blocks = buildPollBlocks(state);

    // Question header as section with mrkdwn
    expect(blocks[0]).toEqual({
      type: 'section',
      text: { type: 'mrkdwn', text: '*:bar_chart: What for lunch?*' },
    });

    // 3 option sections with vote buttons
    for (let i = 1; i <= 3; i++) {
      const block = blocks[i] as { type: string; text: { text: string }; accessory?: { action_id: string } };
      expect(block.type).toBe('section');
      expect(block.text.text).toContain('No votes yet');
      expect(block.accessory?.action_id).toContain('poll_vote_poll-1_');
    }

    // Divider
    expect(blocks[4]).toEqual({ type: 'divider' });

    // No close button in public message
    const blockTypes = blocks.map((b) => b.type);
    expect(blockTypes).not.toContain('actions');

    // Context footer shows multi select
    const contextBlock = blocks[5] as { type: string; elements: Array<{ text: string }> };
    expect(contextBlock.type).toBe('context');
    expect(contextBlock.elements[0].text).toContain('Multi select');
    expect(contextBlock.elements[0].text).toContain('0 total votes');
  });

  it('shows Single select in footer for single-select polls', () => {
    const state = makePollState({ mode: 'single' });
    const blocks = buildPollBlocks(state);

    const contextBlock = blocks[5] as { elements: Array<{ text: string }> };
    expect(contextBlock.elements[0].text).toContain('Single select');
  });

  it('renders an open poll with votes as @mentions', () => {
    const state = makePollState({
      votes: [
        { optionIndex: 0, userId: 'U001' },
        { optionIndex: 0, userId: 'U002' },
        { optionIndex: 2, userId: 'U001' },
      ],
    });

    const blocks = buildPollBlocks(state);

    const pizzaBlock = blocks[1] as { text: { text: string } };
    expect(pizzaBlock.text.text).toContain('<@U001>');
    expect(pizzaBlock.text.text).toContain('<@U002>');
    expect(pizzaBlock.text.text).toContain('(2)');

    const sushiBlock = blocks[2] as { text: { text: string } };
    expect(sushiBlock.text.text).toContain('No votes yet');

    const tacosBlock = blocks[3] as { text: { text: string } };
    expect(tacosBlock.text.text).toContain('<@U001>');
    expect(tacosBlock.text.text).toContain('(1)');

    const contextBlock = blocks[5] as { elements: Array<{ text: string }> };
    expect(contextBlock.elements[0].text).toContain('3 total votes');
  });

  it('renders a closed poll without vote buttons', () => {
    const state = makePollState({
      closedAt: new Date('2026-01-02'),
      votes: [{ optionIndex: 0, userId: 'U001' }],
    });

    const blocks = buildPollBlocks(state);

    for (let i = 1; i <= 3; i++) {
      const block = blocks[i] as { accessory?: unknown };
      expect(block.accessory).toBeUndefined();
    }

    const blockTypes = blocks.map((b) => b.type);
    expect(blockTypes).not.toContain('actions');

    const contextBlock = blocks[blocks.length - 1] as { elements: Array<{ text: string }> };
    expect(contextBlock.elements[0].text).toContain('Poll closed');
  });
});

describe('buildClosePollBlocks', () => {
  it('builds ephemeral close button blocks', () => {
    const blocks = buildClosePollBlocks('poll-123');

    expect(blocks).toHaveLength(2);

    expect(blocks[0]).toEqual({
      type: 'section',
      text: { type: 'mrkdwn', text: 'You can close this poll when voting is done.' },
    });

    const actionsBlock = blocks[1] as { type: string; elements: Array<{ action_id: string; style?: string }> };
    expect(actionsBlock.type).toBe('actions');
    expect(actionsBlock.elements[0].action_id).toBe('poll_close_poll-123');
    expect(actionsBlock.elements[0].style).toBe('danger');
  });
});
