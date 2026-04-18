import type { ParsedQuery, QueryType } from '../types/index.js';
import { parseTimeWindow, toSlackDateParam } from './time-parser.js';

/** Words to strip when extracting keywords */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'this', 'that', 'i', 'me', 'my',
  'did', 'do', 'what', 'how', 'who', 'when', 'where', 'why', 'any', 'all',
  'are', 'was', 'were', 'been', 'have', 'has', 'had', 'about', 'show',
  'tell', 'give', 'get', 'find', 'need', 'want', 'can', 'could', 'would',
  'please', 'latest', 'recent', 'today', 'yesterday', 'week', 'last', 'past',
  'summarize', 'summary', 'happened', 'going', 'said',
]);

/** Slack search operator prefixes — strip these from keyword candidates */
const SLACK_OPERATOR_RE = /^(from:|to:|in:|has:|before:|after:|on:)/i;

/** Extract non-trivial keywords from a raw query string */
function extractKeywords(text: string): readonly string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s@#-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !SLACK_OPERATOR_RE.test(w));
}

/** Detect a #channel reference in the text — returns channel name WITHOUT the # prefix */
function extractChannelName(text: string): string | undefined {
  const match = /#([a-z0-9_-]+)/i.exec(text);
  if (!match) return undefined;
  const raw = match[1] ?? '';
  return raw.replace(/^#/, '');
}

/** Detect a @person mention in the text (excluding bot self-mention prefix) */
function extractPersonMention(text: string): string | undefined {
  // Match @alice or <@U12345> style mentions
  const atMatch = /@([a-z0-9._-]+)/i.exec(text);
  return atMatch ? atMatch[1] : undefined;
}

/**
 * Determine the query category from the raw text.
 * Order matters: more specific patterns checked first.
 */
function detectQueryType(text: string): QueryType {
  const lower = text.toLowerCase();

  // Channel summary — check before personal because "#channel" is explicit
  if (/#[a-z0-9_-]+/.test(lower) || /\bin\s+#/.test(lower) || /\bchannel\b/.test(lower)) {
    return 'channel';
  }

  // Digest / catch-up — check before personal because "what did I miss" is digest not personal
  if (
    /\bdigest\b/.test(lower) ||
    /\bimportant\b/.test(lower) ||
    /\bannouncement\b/.test(lower) ||
    /\bwhat did i miss\b/.test(lower) ||
    /\bwhat\s+(?:i|did\s+i)\s+miss(?:ed)?\b/.test(lower) ||
    /\bhighlight\b/.test(lower)
  ) {
    return 'digest';
  }

  // Personal activity
  if (
    /\bi did\b/.test(lower) ||
    /\bmy work\b/.test(lower) ||
    /\bwhat did i\b/.test(lower) ||
    /\bi (worked|sent|wrote|posted|shared)\b/.test(lower) ||
    /\bmy (tasks?|messages?|activity)\b/.test(lower)
  ) {
    return 'personal';
  }

  // Mentions / replies needed
  if (
    /\bmentions?\b/.test(lower) ||
    /\b@me\b/.test(lower) ||
    /\bneed to reply\b/.test(lower) ||
    /\bunreplied\b/.test(lower) ||
    /\b@here\b/.test(lower) ||
    /\b@channel\b/.test(lower)
  ) {
    return 'mentions';
  }

  // People / topic search (fallback)
  return 'people';
}

/**
 * Quote a keyword for Slack search:
 * - Escape any embedded double-quotes
 * - Wrap multi-word phrases in double quotes
 */
function quoteKeyword(kw: string): string {
  const escaped = kw.replace(/"/g, '\\"');
  return escaped.includes(' ') ? `"${escaped}"` : escaped;
}

/**
 * Assemble a Slack search query string from the parsed components.
 * B4 fix: use `in:channelname` without the `#` prefix.
 * M8 fix: quote multi-word keywords, escape special chars.
 */
function buildSearchQuery(
  type: QueryType,
  keywords: readonly string[],
  channelName?: string,
  personMention?: string,
  timeWindow?: { readonly oldest: number; readonly latest: number },
): string {
  const parts: string[] = [];

  switch (type) {
    case 'personal':
      parts.push('from:@me');
      break;
    case 'mentions':
      parts.push('to:@me');
      break;
    case 'channel':
      if (channelName) {
        // B4: no `#` in front of channel name for Slack search
        parts.push(`in:${channelName}`);
      }
      break;
    case 'people':
      if (personMention) {
        parts.push(`from:@${personMention}`);
      }
      break;
    case 'digest':
      // No special modifier; let keywords drive the search
      break;
  }

  if (keywords.length > 0) {
    parts.push(...keywords.map(quoteKeyword));
  }

  if (timeWindow) {
    const afterDate = toSlackDateParam(timeWindow.oldest);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const isSingleDay = timeWindow.latest - timeWindow.oldest <= 86400 &&
      timeWindow.latest <= nowSeconds + 60;

    if (isSingleDay && timeWindow.latest <= nowSeconds + 60) {
      // B5: single-day window — use on: which is inclusive
      parts.push(`on:${afterDate}`);
    } else {
      parts.push(`after:${afterDate}`);
      if (timeWindow.latest < nowSeconds - 60) {
        parts.push(`before:${toSlackDateParam(timeWindow.latest)}`);
      }
    }
  }

  const query = parts.join(' ').trim();

  // M7: if query is empty after assembly, surface a friendly fallback message marker
  // The pipeline will detect the empty string and respond with a helpful message.
  return query;
}

/**
 * Parse a raw user question into a structured ParsedQuery.
 */
export function parseQuery(rawText: string): ParsedQuery {
  const type = detectQueryType(rawText);
  const keywords = extractKeywords(rawText);
  const channelName = extractChannelName(rawText);
  const personMention = type === 'people' ? extractPersonMention(rawText) : undefined;
  const timeWindow = parseTimeWindow(rawText);

  const searchQuery = buildSearchQuery(type, keywords, channelName, personMention, timeWindow);

  return Object.freeze({
    raw: rawText,
    type,
    keywords,
    channelName,
    personMention,
    timeWindow,
    searchQuery,
  });
}
