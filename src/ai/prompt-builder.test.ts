import { describe, it, expect } from 'vitest';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt-builder.js';
import type { ParsedQuery, SearchResult } from '../types/index.js';

function makeQuery(overrides: Partial<ParsedQuery> = {}): ParsedQuery {
  return Object.freeze({
    raw: 'what happened today?',
    type: 'personal',
    keywords: ['happened'],
    channelName: undefined,
    personMention: undefined,
    timeWindow: undefined,
    searchQuery: 'from:@me after:2024-03-15',
    ...overrides,
  });
}

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    messageId: '1710504000.000001',
    text: 'Deployed the new feature',
    userId: 'U12345',
    channelId: 'C12345',
    channelName: 'engineering',
    timestamp: '1710504000.000001',
    permalink: 'https://slack.com/msg/1',
    reactionCount: 0,
    replyCount: 0,
    ...overrides,
  };
}

describe('SYSTEM_PROMPT', () => {
  it('contains core rules', () => {
    expect(SYSTEM_PROMPT).toContain('AskBot');
    expect(SYSTEM_PROMPT).toContain('ONLY use information from the provided messages');
    expect(SYSTEM_PROMPT).toContain('cite sources');
  });
});

describe('buildUserPrompt', () => {
  it('includes the user question', () => {
    const prompt = buildUserPrompt(makeQuery({ raw: 'what happened today?' }), [makeResult()]);
    expect(prompt).toContain('what happened today?');
  });

  it('includes message content in grouped format', () => {
    const prompt = buildUserPrompt(makeQuery(), [makeResult({ text: 'Deployed the new feature' })]);
    expect(prompt).toContain('Deployed the new feature');
  });

  it('groups messages by channel', () => {
    const results = [
      makeResult({ channelName: 'engineering', text: 'msg1' }),
      makeResult({ messageId: 'ts-2', channelName: 'general', text: 'msg2' }),
    ];
    const prompt = buildUserPrompt(makeQuery(), results);
    expect(prompt).toContain('#engineering');
    expect(prompt).toContain('#general');
  });

  it('returns no-results message when empty', () => {
    const prompt = buildUserPrompt(makeQuery(), []);
    expect(prompt).toContain('No matching messages were found');
  });

  it('shows message count', () => {
    const results = [makeResult(), makeResult({ messageId: 'ts-2' })];
    const prompt = buildUserPrompt(makeQuery(), results);
    expect(prompt).toContain('2 most relevant');
  });

  it('includes reaction and reply indicators when present', () => {
    const result = makeResult({ reactionCount: 3, replyCount: 5 });
    const prompt = buildUserPrompt(makeQuery(), [result]);
    expect(prompt).toContain('3 reactions');
    expect(prompt).toContain('5 replies');
  });

  it('does not include reaction brackets when 0 reactions', () => {
    const result = makeResult({ reactionCount: 0, replyCount: 0 });
    const prompt = buildUserPrompt(makeQuery(), [result]);
    expect(prompt).not.toContain('[0 reactions]');
  });
});
