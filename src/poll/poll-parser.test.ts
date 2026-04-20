import { describe, it, expect } from 'vitest';
import { parsePollCommand } from './poll-parser.js';

describe('parsePollCommand', () => {
  it('defaults to single mode when no mode specified', () => {
    const result = parsePollCommand('poll "Lunch?" "Pizza" "Sushi"');
    expect(result.success).toBe(true);
    expect(result.data?.mode).toBe('single');
    expect(result.data?.question).toBe('Lunch?');
    expect(result.data?.options).toEqual(['Pizza', 'Sushi']);
  });

  it('parses single mode', () => {
    const result = parsePollCommand('poll single "Lunch?" "Pizza" "Sushi"');
    expect(result.success).toBe(true);
    expect(result.data?.mode).toBe('single');
    expect(result.data?.question).toBe('Lunch?');
  });

  it('parses multi mode explicitly', () => {
    const result = parsePollCommand('poll multi "Lunch?" "Pizza" "Sushi"');
    expect(result.success).toBe(true);
    expect(result.data?.mode).toBe('multi');
  });

  it('handles mode case-insensitively', () => {
    const result = parsePollCommand('poll Single "Q?" "A" "B"');
    expect(result.success).toBe(true);
    expect(result.data?.mode).toBe('single');
  });

  it('parses a valid poll with 5 options', () => {
    const result = parsePollCommand(
      'poll single "Pick a color" "Red" "Blue" "Green" "Yellow" "Purple"',
    );
    expect(result.success).toBe(true);
    expect(result.data?.options).toHaveLength(5);
    expect(result.data?.mode).toBe('single');
  });

  it('parses a poll with 10 options (max)', () => {
    const opts = Array.from({ length: 10 }, (_, i) => `"Option ${i + 1}"`).join(' ');
    const result = parsePollCommand(`poll "Question?" ${opts}`);
    expect(result.success).toBe(true);
    expect(result.data?.options).toHaveLength(10);
  });

  it('fails with no quoted strings', () => {
    const result = parsePollCommand('poll something without quotes');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Usage');
  });

  it('fails with only a question (no options)', () => {
    const result = parsePollCommand('poll "Just a question?"');
    expect(result.success).toBe(false);
    expect(result.error).toContain('2 options');
  });

  it('fails with only 1 option', () => {
    const result = parsePollCommand('poll single "Question?" "Only one"');
    expect(result.success).toBe(false);
    expect(result.error).toContain('2 options');
  });

  it('fails with 11 options (exceeds max)', () => {
    const opts = Array.from({ length: 11 }, (_, i) => `"Opt ${i}"`).join(' ');
    const result = parsePollCommand(`poll "Q?" ${opts}`);
    expect(result.success).toBe(false);
    expect(result.error).toContain('10 options');
  });

  it('handles special characters in question and options', () => {
    const result = parsePollCommand('poll "What\'s up & going?" "A & B" "C < D"');
    expect(result.success).toBe(true);
    expect(result.data?.question).toBe("What's up & going?");
    expect(result.data?.options).toEqual(['A & B', 'C < D']);
  });

  it('ignores unquoted text between quoted strings', () => {
    const result = parsePollCommand('poll multi "Question?" extra "A" more "B"');
    expect(result.success).toBe(true);
    expect(result.data?.question).toBe('Question?');
    expect(result.data?.options).toEqual(['A', 'B']);
  });
});
