import type { SlackMessage } from '../types/index.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up', 'that',
  'this', 'these', 'those', 'what', 'which', 'who', 'whom', 'it', 'its',
  'he', 'she', 'they', 'them', 'his', 'her', 'their', 'we', 'us', 'our',
  'tell', 'me', 'show', 'give', 'get', 'got', 'please', 'thanks',
  'across', 'channels',
]);

const PERSONAL_WORDS = new Set(['i', 'my', 'me', 'mine', 'myself']);

export interface QueryIntent {
  readonly keywords: readonly string[];
  readonly isPersonal: boolean;
  readonly hoursBack: number;
  readonly targetChannel: string | null;
  readonly targetDate: string | null;
}

function parseHoursBack(question: string): number {
  const lower = question.toLowerCase();

  if (/\btoday\b/.test(lower) || /\bthis morning\b/.test(lower)) return 24;
  if (/\byesterday\b/.test(lower)) return 48;
  if (/\bthis week\b/.test(lower) || /\bpast week\b/.test(lower)) return 168;
  if (/\blast week\b/.test(lower)) return 336;
  if (/\blast (\d+) hours?\b/.test(lower)) {
    const match = lower.match(/\blast (\d+) hours?\b/);
    return match?.[1] ? parseInt(match[1], 10) : 24;
  }
  if (/\blast (\d+) days?\b/.test(lower)) {
    const match = lower.match(/\blast (\d+) days?\b/);
    return match?.[1] ? parseInt(match[1], 10) * 24 : 24;
  }

  return 24;
}

function parseTargetChannel(question: string): string | null {
  const match = question.match(/#([\w-]+)/);
  return match?.[1] ?? null;
}

function parseTargetDate(question: string): string | null {
  const lower = question.toLowerCase();

  const dateMatch = lower.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (dateMatch) return dateMatch[0] ?? null;

  const namedMatch = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/,
  );
  if (namedMatch) return namedMatch[0] ?? null;

  if (/\btoday\b/.test(lower)) return 'today';
  if (/\byesterday\b/.test(lower)) return 'yesterday';

  return null;
}

export function extractKeywords(question: string): readonly string[] {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s#@-]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

export function parseQuery(question: string): QueryIntent {
  const lower = question.toLowerCase();
  const words = lower.split(/\s+/);
  const isPersonal = words.some((w) => PERSONAL_WORDS.has(w));

  return {
    keywords: extractKeywords(question),
    isPersonal,
    hoursBack: parseHoursBack(question),
    targetChannel: parseTargetChannel(question),
    targetDate: parseTargetDate(question),
  };
}

export function scoreMessage(message: SlackMessage, keywords: readonly string[]): number {
  if (keywords.length === 0) return 0.1;

  const textLower = message.text.toLowerCase();
  let score = 0;
  let matches = 0;

  for (const keyword of keywords) {
    if (textLower.includes(keyword)) {
      matches++;
      score += 1;
    }
  }

  if (matches === 0) return 0;

  const fullPhrase = keywords.join(' ');
  if (fullPhrase.length > 3 && textLower.includes(fullPhrase)) {
    score += 2;
  }

  return Math.min(score / keywords.length, 1);
}

export function filterByUser(
  messages: readonly SlackMessage[],
  userId: string,
): readonly SlackMessage[] {
  return messages.filter((m) => m.userId === userId);
}
