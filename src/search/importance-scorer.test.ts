import { describe, it, expect } from 'vitest';
import { scoreMessage, rankByImportance, deduplicateResults, processResults } from './importance-scorer.js';
import type { SearchResult } from '../types/index.js';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    messageId: 'ts-default',
    text: 'hello',
    userId: 'U12345',
    channelId: 'C12345',
    channelName: 'general',
    timestamp: '1710504000.000001',
    permalink: 'https://slack.com/msg/1',
    reactionCount: 0,
    replyCount: 0,
    ...overrides,
  };
}

describe('scoreMessage', () => {
  it('returns 0 for message with no reactions or replies', () => {
    expect(scoreMessage(makeResult())).toBe(0);
  });

  it('scores reactions at weight 2', () => {
    expect(scoreMessage(makeResult({ reactionCount: 5 }))).toBe(10);
  });

  it('scores replies at weight 1', () => {
    expect(scoreMessage(makeResult({ replyCount: 3 }))).toBe(3);
  });

  it('combines reactions and replies', () => {
    expect(scoreMessage(makeResult({ reactionCount: 2, replyCount: 4 }))).toBe(8);
  });
});

describe('rankByImportance', () => {
  it('returns results sorted by score descending', () => {
    const results = [
      makeResult({ messageId: 'ts-1', reactionCount: 1 }),
      makeResult({ messageId: 'ts-2', reactionCount: 5 }),
      makeResult({ messageId: 'ts-3', reactionCount: 2 }),
    ];
    const ranked = rankByImportance(results, 10);
    expect(ranked[0].messageId).toBe('ts-2');
    expect(ranked[1].messageId).toBe('ts-3');
    expect(ranked[2].messageId).toBe('ts-1');
  });

  it('caps results at topN', () => {
    const results = Array.from({ length: 20 }, (_, i) =>
      makeResult({ messageId: `ts-${i}` }),
    );
    expect(rankByImportance(results, 5)).toHaveLength(5);
  });

  it('returns all results when fewer than topN', () => {
    const results = [makeResult(), makeResult({ messageId: 'ts-2' })];
    expect(rankByImportance(results, 15)).toHaveLength(2);
  });
});

describe('deduplicateResults', () => {
  it('removes duplicate messageIds', () => {
    const results = [
      makeResult({ messageId: 'ts-1' }),
      makeResult({ messageId: 'ts-1' }),
      makeResult({ messageId: 'ts-2' }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((r) => r.messageId)).toEqual(['ts-1', 'ts-2']);
  });

  it('preserves order of first occurrence', () => {
    const results = [
      makeResult({ messageId: 'ts-3' }),
      makeResult({ messageId: 'ts-1' }),
      makeResult({ messageId: 'ts-3' }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped[0].messageId).toBe('ts-3');
    expect(deduped[1].messageId).toBe('ts-1');
  });
});

describe('processResults', () => {
  it('deduplicates then ranks', () => {
    const results = [
      makeResult({ messageId: 'ts-1', reactionCount: 1 }),
      makeResult({ messageId: 'ts-1', reactionCount: 99 }), // duplicate should be removed
      makeResult({ messageId: 'ts-2', reactionCount: 5 }),
    ];
    const processed = processResults(results, 10);
    expect(processed).toHaveLength(2);
    expect(processed[0].messageId).toBe('ts-2'); // higher score
  });
});
