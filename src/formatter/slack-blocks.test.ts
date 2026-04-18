import { describe, it, expect } from 'vitest';
import { buildResponseBlocks, buildNoResultsBlocks, buildConnectAccountBlocks } from './slack-blocks.js';
import type { AISummary } from '../types/index.js';

function makeSummary(overrides: Partial<AISummary> = {}): AISummary {
  return Object.freeze({
    answer: 'Here is what happened today.',
    channelsCited: ['engineering', 'general'],
    messageCount: 5,
    model: 'claude-sonnet-4-20250514',
    ...overrides,
  });
}

describe('buildResponseBlocks', () => {
  it('includes at least one section block with the answer', () => {
    const blocks = buildResponseBlocks(makeSummary());
    const sections = blocks.filter((b) => b.type === 'section');
    expect(sections.length).toBeGreaterThanOrEqual(1);
  });

  it('includes a divider block', () => {
    const blocks = buildResponseBlocks(makeSummary());
    expect(blocks.some((b) => b.type === 'divider')).toBe(true);
  });

  it('includes a context block with sources', () => {
    const blocks = buildResponseBlocks(makeSummary());
    const contextBlock = blocks.find((b) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    const ctx = contextBlock as { type: 'context'; elements: Array<{ type: string; text: string }> };
    expect(ctx.elements[0].text).toContain('#engineering');
    expect(ctx.elements[0].text).toContain('#general');
  });

  it('includes message count in context', () => {
    const blocks = buildResponseBlocks(makeSummary({ messageCount: 7 }));
    const ctx = blocks.find((b) => b.type === 'context') as { type: 'context'; elements: Array<{ text: string }> };
    expect(ctx.elements[0].text).toContain('7 messages analyzed');
  });

  it('uses singular "message" for count of 1', () => {
    const blocks = buildResponseBlocks(makeSummary({ messageCount: 1 }));
    const ctx = blocks.find((b) => b.type === 'context') as { type: 'context'; elements: Array<{ text: string }> };
    expect(ctx.elements[0].text).toContain('1 message analyzed');
    expect(ctx.elements[0].text).not.toContain('1 messages analyzed');
  });

  it('splits long answers into multiple section blocks', () => {
    const longAnswer = 'x'.repeat(5000);
    const blocks = buildResponseBlocks(makeSummary({ answer: longAnswer }));
    const sections = blocks.filter((b) => b.type === 'section');
    expect(sections.length).toBeGreaterThan(1);
  });

  it('shows "various channels" when no channels cited', () => {
    const blocks = buildResponseBlocks(makeSummary({ channelsCited: [] }));
    const ctx = blocks.find((b) => b.type === 'context') as { type: 'context'; elements: Array<{ text: string }> };
    expect(ctx.elements[0].text).toContain('various channels');
  });
});

describe('buildNoResultsBlocks', () => {
  it('includes the query text in the response', () => {
    const blocks = buildNoResultsBlocks('deployment status');
    const section = blocks.find((b) => b.type === 'section') as { type: 'section'; text: { text: string } };
    expect(section.text.text).toContain('deployment status');
  });

  it('returns at least one block', () => {
    expect(buildNoResultsBlocks('query').length).toBeGreaterThan(0);
  });
});

describe('buildConnectAccountBlocks', () => {
  it('includes the install URL in a button', () => {
    const blocks = buildConnectAccountBlocks('https://example.com/auth/install?user_id=U12345');
    const actionsBlock = blocks.find((b) => b.type === 'actions') as {
      type: 'actions';
      elements: Array<{ url: string }>;
    };
    expect(actionsBlock).toBeDefined();
    expect(actionsBlock.elements[0].url).toContain('https://example.com/auth/install');
  });

  it('includes a section block explaining the need to connect', () => {
    const blocks = buildConnectAccountBlocks('https://example.com/auth/install');
    const section = blocks.find((b) => b.type === 'section') as { type: 'section'; text: { text: string } };
    expect(section.text.text).toContain('connect');
  });
});
