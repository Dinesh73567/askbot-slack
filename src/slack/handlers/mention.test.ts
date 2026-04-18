import { describe, it, expect } from 'vitest';
import { stripBotMention, buildEchoResponse } from './mention.js';

describe('stripBotMention', () => {
  it('removes bot mention from the start of text', () => {
    expect(stripBotMention('<@U12345> what happened today?')).toBe(
      'what happened today?',
    );
  });

  it('removes bot mention from the middle of text', () => {
    expect(stripBotMention('hey <@U12345> what happened?')).toBe(
      'hey what happened?',
    );
  });

  it('handles multiple mentions and only strips bot-style mentions', () => {
    expect(stripBotMention('<@U12345> tell me about <@U99999>')).toBe(
      'tell me about <@U99999>',
    );
  });

  it('trims whitespace after stripping', () => {
    expect(stripBotMention('  <@UABC>   hello  ')).toBe('hello');
  });

  it('returns original text when no mention present', () => {
    expect(stripBotMention('hello world')).toBe('hello world');
  });

  it('returns empty string for mention-only text', () => {
    expect(stripBotMention('<@U12345>')).toBe('');
  });
});

describe('buildEchoResponse', () => {
  it('wraps question in echo response', () => {
    expect(buildEchoResponse('what happened today?')).toBe(
      'I heard: what happened today?',
    );
  });

  it('returns prompt when question is empty', () => {
    expect(buildEchoResponse('')).toBe(
      'Please ask me a question! Example: @AskBot what happened today?',
    );
  });
});
