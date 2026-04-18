import { describe, it, expect } from 'vitest';
import { formatResponse, formatErrorResponse, formatThinkingResponse } from './slack-blocks.js';
import type { AISummary } from '../types/index.js';

describe('formatResponse', () => {
  it('creates blocks with answer, divider, and context', () => {
    const summary: AISummary = {
      answer: 'Here is the summary of deployment activities.',
      channelsCited: ['general', 'devops'],
      messageCount: 10,
      model: 'claude-sonnet-4-20250514',
    };

    const blocks = formatResponse(summary);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks[0]?.type).toBe('section');
    expect(blocks.some((b) => b.type === 'divider')).toBe(true);
    expect(blocks.some((b) => b.type === 'context')).toBe(true);
  });

  it('splits long answers into multiple section blocks', () => {
    const longAnswer = 'A'.repeat(3000);
    const summary: AISummary = {
      answer: longAnswer,
      channelsCited: ['general'],
      messageCount: 5,
      model: 'claude-sonnet-4-20250514',
    };

    const blocks = formatResponse(summary);
    const sections = blocks.filter((b) => b.type === 'section');
    expect(sections.length).toBeGreaterThan(1);
  });

  it('includes channel sources in context', () => {
    const summary: AISummary = {
      answer: 'test',
      channelsCited: ['general', 'random'],
      messageCount: 3,
      model: 'claude-sonnet-4-20250514',
    };

    const blocks = formatResponse(summary);
    const context = blocks.find((b) => b.type === 'context');
    const contextText = (context?.elements as readonly { text: string }[])?.[0]?.text ?? '';
    expect(contextText).toContain('#general');
    expect(contextText).toContain('#random');
    expect(contextText).toContain('3 messages analyzed');
  });
});

describe('formatErrorResponse', () => {
  it('creates error block with message', () => {
    const blocks = formatErrorResponse('Something broke');
    expect(blocks[0]?.type).toBe('section');
    expect(blocks[0]?.text?.text).toContain('Something broke');
  });
});

describe('formatThinkingResponse', () => {
  it('returns a searching message', () => {
    expect(formatThinkingResponse()).toContain('Searching');
  });
});
