import { z } from 'zod';
import type { Envelope, ParsedPollCommand, PollMode } from '../types/index.js';
import { ok, fail } from '../utils/envelope.js';

const QUOTED_STRING_REGEX = /"([^"]+)"/g;
const MODE_REGEX = /^(single|multi)\s+/i;

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const MAX_QUESTION_LENGTH = 500;
const MAX_OPTION_LENGTH = 200;

const pollSchema = z.object({
  question: z.string().min(1, 'Question is required').max(MAX_QUESTION_LENGTH),
  options: z
    .array(z.string().min(1, 'Option cannot be empty').max(MAX_OPTION_LENGTH))
    .min(MIN_OPTIONS, `At least ${MIN_OPTIONS} options required`)
    .max(MAX_OPTIONS, `Maximum ${MAX_OPTIONS} options allowed`),
});

/**
 * Parse a poll command string.
 * Format: poll [single|multi] "Question?" "Option A" "Option B"
 * Mode defaults to "multi" if not specified.
 */
export function parsePollCommand(text: string): Envelope<ParsedPollCommand> {
  const stripped = text.replace(/^poll\s*/i, '');

  // Extract mode if present
  const modeMatch = stripped.match(MODE_REGEX);
  const mode: PollMode = modeMatch?.[1]
    ? (modeMatch[1].toLowerCase() as PollMode)
    : 'single';
  const afterMode = modeMatch ? stripped.slice(modeMatch[0].length) : stripped;

  const matches = [...afterMode.matchAll(QUOTED_STRING_REGEX)].map((m) => m[1]);

  if (matches.length === 0) {
    return fail(
      'Invalid format. Usage: `/askbot poll single "Your question?" "Option 1" "Option 2"`\n' +
      'Mode: `single` (one vote) or `multi` (multiple votes, default)',
    );
  }

  const [question, ...options] = matches;

  const result = pollSchema.safeParse({ question, options });

  if (!result.success) {
    const firstError = result.error.errors[0]?.message ?? 'Invalid input';
    return fail(firstError);
  }

  return ok({
    question: result.data.question,
    options: result.data.options,
    mode,
  });
}
