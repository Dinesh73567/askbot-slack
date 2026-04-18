import { describe, it, expect } from 'vitest';
import { buildUserPrompt, buildNoResultsPrompt, SYSTEM_PROMPT } from './prompt-builder.js';
import type { GroupedResults } from '../types/index.js';

describe('SYSTEM_PROMPT', () => {
  it('contains key instructions', () => {
    expect(SYSTEM_PROMPT).toContain('AskBot');
    expect(SYSTEM_PROMPT).toContain('ONLY use information from the provided messages');
    expect(SYSTEM_PROMPT).toContain('cite sources');
  });
});

describe('buildUserPrompt', () => {
  it('includes question and message count', () => {
    const groups: GroupedResults[] = [
      {
        channelName: 'general',
        channelId: 'C1',
        messages: [
          {
            text: 'deployment is done',
            userId: 'U1',
            username: 'alice',
            channelId: 'C1',
            channelName: 'general',
            timestamp: '1713445800.000',
            rank: 1,
            relevanceScore: 0.9,
          },
        ],
      },
    ];

    const result = buildUserPrompt('what happened with deployment?', groups);
    expect(result).toContain('QUESTION: what happened with deployment?');
    expect(result).toContain('1 messages from 1 channels');
    expect(result).toContain('#general');
    expect(result).toContain('@alice');
    expect(result).toContain('deployment is done');
  });

  it('handles multiple channels', () => {
    const groups: GroupedResults[] = [
      {
        channelName: 'general',
        channelId: 'C1',
        messages: [{
          text: 'msg1', userId: 'U1', username: 'alice',
          channelId: 'C1', channelName: 'general',
          timestamp: '1713445800.000', rank: 1, relevanceScore: 0.9,
        }],
      },
      {
        channelName: 'random',
        channelId: 'C2',
        messages: [{
          text: 'msg2', userId: 'U2', username: 'bob',
          channelId: 'C2', channelName: 'random',
          timestamp: '1713445900.000', rank: 2, relevanceScore: 0.8,
        }],
      },
    ];

    const result = buildUserPrompt('test', groups);
    expect(result).toContain('2 messages from 2 channels');
    expect(result).toContain('#general');
    expect(result).toContain('#random');
  });
});

describe('buildNoResultsPrompt', () => {
  it('includes the question', () => {
    const result = buildNoResultsPrompt('what happened?');
    expect(result).toContain('what happened?');
    expect(result).toContain('No relevant messages');
  });
});
