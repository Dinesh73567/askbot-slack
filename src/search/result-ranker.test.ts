import { describe, it, expect } from 'vitest';
import { rankResults, groupByChannel } from './result-ranker.js';
import type { SlackMessage, RankedResult } from '../types/index.js';

const makeMessage = (text: string, channelId: string = 'C1', ts: string = '1234567890.000'): SlackMessage => ({
  text,
  userId: 'U1',
  username: 'testuser',
  channelId,
  channelName: channelId === 'C1' ? 'general' : 'random',
  timestamp: ts,
});

describe('rankResults', () => {
  it('ranks matching messages by relevance', () => {
    const messages = [
      makeMessage('hello world', 'C1', '1.0'),
      makeMessage('deployment is done', 'C1', '2.0'),
      makeMessage('deployment status update', 'C1', '3.0'),
    ];
    const result = rankResults(messages, ['deployment']);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.text).toContain('deployment');
  });

  it('caps results at 15', () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      makeMessage(`deployment item ${i}`, 'C1', `${i}.0`),
    );
    const result = rankResults(messages, ['deployment']);
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it('deduplicates by timestamp', () => {
    const messages = [
      makeMessage('deployment one', 'C1', '1.0'),
      makeMessage('deployment two', 'C1', '1.0'),
    ];
    const result = rankResults(messages, ['deployment']);
    expect(result).toHaveLength(1);
  });

  it('assigns rank numbers starting from 1', () => {
    const messages = [
      makeMessage('deployment one', 'C1', '1.0'),
      makeMessage('deployment two', 'C1', '2.0'),
    ];
    const result = rankResults(messages, ['deployment']);
    expect(result[0]?.rank).toBe(1);
    expect(result[1]?.rank).toBe(2);
  });
});

describe('groupByChannel', () => {
  it('groups results by channel', () => {
    const results: RankedResult[] = [
      { ...makeMessage('msg1', 'C1', '1.0'), rank: 1, relevanceScore: 0.8 },
      { ...makeMessage('msg2', 'C2', '2.0'), rank: 2, relevanceScore: 0.7 },
      { ...makeMessage('msg3', 'C1', '3.0'), rank: 3, relevanceScore: 0.6 },
    ];
    const groups = groupByChannel(results);
    expect(groups).toHaveLength(2);
    const generalGroup = groups.find((g) => g.channelName === 'general');
    expect(generalGroup?.messages).toHaveLength(2);
  });
});
