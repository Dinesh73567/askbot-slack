import { describe, it, expect } from 'vitest';
import { extractKeywords, parseQuery, scoreMessage, filterByUser } from './keyword-matcher.js';
import type { SlackMessage } from '../types/index.js';

const makeMessage = (text: string, userId: string = 'U1'): SlackMessage => ({
  text,
  userId,
  username: 'testuser',
  channelId: 'C1',
  channelName: 'general',
  timestamp: '1234567890.123456',
});

describe('extractKeywords', () => {
  it('removes stop words', () => {
    const result = extractKeywords('what is the status of deployment');
    expect(result).toContain('status');
    expect(result).toContain('deployment');
    expect(result).not.toContain('what');
    expect(result).not.toContain('is');
    expect(result).not.toContain('the');
    expect(result).not.toContain('of');
  });

  it('lowercases all keywords', () => {
    const result = extractKeywords('DEPLOYMENT Status');
    expect(result).toContain('deployment');
    expect(result).toContain('status');
  });

  it('filters short words', () => {
    const result = extractKeywords('a I go to x');
    expect(result).toEqual(['go']);
  });
});

describe('parseQuery', () => {
  it('detects personal queries', () => {
    const result = parseQuery('what did I do today?');
    expect(result.isPersonal).toBe(true);
  });

  it('detects non-personal queries', () => {
    const result = parseQuery('what happened with deployment?');
    expect(result.isPersonal).toBe(false);
  });

  it('detects "today" time range', () => {
    const result = parseQuery('what happened today');
    expect(result.hoursBack).toBe(24);
  });

  it('detects "yesterday" time range', () => {
    const result = parseQuery('what happened yesterday');
    expect(result.hoursBack).toBe(48);
  });

  it('detects "this week" time range', () => {
    const result = parseQuery('summary of this week');
    expect(result.hoursBack).toBe(168);
  });

  it('detects target channel', () => {
    const result = parseQuery('what happened in #general');
    expect(result.targetChannel).toBe('general');
  });

  it('returns null for no target channel', () => {
    const result = parseQuery('what happened today');
    expect(result.targetChannel).toBeNull();
  });

  it('detects target date "today"', () => {
    const result = parseQuery('tasks for today');
    expect(result.targetDate).toBe('today');
  });

  it('detects target date "yesterday"', () => {
    const result = parseQuery('tasks for yesterday');
    expect(result.targetDate).toBe('yesterday');
  });
});

describe('scoreMessage', () => {
  it('scores matching messages > 0', () => {
    const msg = makeMessage('The deployment is complete');
    expect(scoreMessage(msg, ['deployment'])).toBeGreaterThan(0);
  });

  it('scores non-matching messages as 0', () => {
    const msg = makeMessage('Hello world');
    expect(scoreMessage(msg, ['deployment'])).toBe(0);
  });

  it('gives higher score for exact phrase match', () => {
    const msg = makeMessage('the deployment status is green');
    const phraseScore = scoreMessage(msg, ['deployment', 'status']);
    const singleScore = scoreMessage(msg, ['deployment']);
    expect(phraseScore).toBeGreaterThanOrEqual(singleScore);
  });

  it('returns small score for empty keywords', () => {
    const msg = makeMessage('anything');
    expect(scoreMessage(msg, [])).toBe(0.1);
  });
});

describe('filterByUser', () => {
  it('filters to only the specified user', () => {
    const messages = [
      makeMessage('msg1', 'U1'),
      makeMessage('msg2', 'U2'),
      makeMessage('msg3', 'U1'),
    ];
    const result = filterByUser(messages, 'U1');
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.userId === 'U1')).toBe(true);
  });

  it('returns empty array if no matches', () => {
    const messages = [makeMessage('msg1', 'U1')];
    const result = filterByUser(messages, 'U999');
    expect(result).toHaveLength(0);
  });
});
