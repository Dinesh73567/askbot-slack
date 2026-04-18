import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseQuery } from './query-parser.js';

const FIXED_NOW = new Date('2024-03-15T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('parseQuery', () => {
  describe('personal activity queries', () => {
    it('detects personal type for "what did I do today"', () => {
      const result = parseQuery('what did I do today?');
      expect(result.type).toBe('personal');
    });

    it('includes from:@me in search query for personal', () => {
      const result = parseQuery('what did I do today?');
      expect(result.searchQuery).toContain('from:@me');
    });

    it('detects my work query', () => {
      const result = parseQuery('summarize my work this week');
      expect(result.type).toBe('personal');
    });

    it('adds time window to search query when today is mentioned', () => {
      const result = parseQuery('what did I do today?');
      // Single-day windows use `on:` which is inclusive in Slack search
      expect(result.searchQuery).toMatch(/\bon:\d{4}-\d{2}-\d{2}\b/);
      expect(result.timeWindow).toBeDefined();
    });
  });

  describe('channel queries', () => {
    it('detects channel type for #channel reference', () => {
      const result = parseQuery('summarize #general today');
      expect(result.type).toBe('channel');
    });

    it('extracts channel name', () => {
      const result = parseQuery('what happened in #engineering?');
      expect(result.channelName).toBe('engineering');
    });

    it('includes in:channel (without #) in search query', () => {
      const result = parseQuery('what happened in #engineering?');
      // Slack search syntax requires in:channelname without the # prefix
      expect(result.searchQuery).toContain('in:engineering');
      expect(result.searchQuery).not.toContain('in:#engineering');
    });
  });

  describe('mentions queries', () => {
    it('detects mentions type', () => {
      const result = parseQuery('What mentions do I need to reply to?');
      expect(result.type).toBe('mentions');
    });

    it('includes to:@me in search query', () => {
      const result = parseQuery('show me unreplied @mentions');
      expect(result.type).toBe('mentions');
      expect(result.searchQuery).toContain('to:@me');
    });
  });

  describe('digest queries', () => {
    it('detects digest type for daily digest', () => {
      const result = parseQuery('give me a daily digest');
      expect(result.type).toBe('digest');
    });

    it('detects digest type for important messages', () => {
      const result = parseQuery("today's important messages");
      expect(result.type).toBe('digest');
    });

    it('detects what did I miss', () => {
      const result = parseQuery('what did I miss yesterday?');
      expect(result.type).toBe('digest');
    });
  });

  describe('people/topic queries', () => {
    it('defaults to people type for topic searches', () => {
      const result = parseQuery('latest on Project X?');
      expect(result.type).toBe('people');
    });
  });

  describe('keywords extraction', () => {
    it('extracts meaningful keywords', () => {
      const result = parseQuery('what is the deployment status?');
      expect(result.keywords).toContain('deployment');
      expect(result.keywords).toContain('status');
    });

    it('excludes stop words', () => {
      const result = parseQuery('what is the deployment status?');
      expect(result.keywords).not.toContain('what');
      expect(result.keywords).not.toContain('the');
      expect(result.keywords).not.toContain('is');
    });
  });

  describe('raw text preservation', () => {
    it('preserves raw text unchanged', () => {
      const raw = 'What did Alice say about deployment?';
      const result = parseQuery(raw);
      expect(result.raw).toBe(raw);
    });
  });
});
