import type { App } from '@slack/bolt';
import type { Logger } from '../../utils/logger.js';
import { parsePollCommand } from '../../poll/poll-parser.js';
import {
  createPoll,
  updatePollMessageTs,
  getPollById,
  toggleVote,
  getVotesForPoll,
  closePoll,
} from '../../poll/poll-store.js';
import { buildPollBlocks, buildClosePollBlocks } from '../../poll/poll-blocks.js';
import type { PollState, PollVoteRecord } from '../../types/index.js';

/**
 * Build a PollState from poll data and votes.
 * No name resolution needed - we use <@userId> format in blocks.
 */
async function buildPollState(
  pollId: string,
  logger: Logger,
): Promise<PollState | null> {
  const pollResult = await getPollById(pollId);
  if (!pollResult.success || !pollResult.data) {
    logger.warn({ pollId }, 'Poll not found');
    return null;
  }

  const votesResult = await getVotesForPoll(pollId);
  const votes: readonly PollVoteRecord[] =
    votesResult.success && votesResult.data ? votesResult.data : [];

  return {
    poll: pollResult.data,
    votes,
    voterNames: new Map(),
  };
}

const USAGE_TEXT =
  'Usage: `/askbot poll single "Your question?" "Option 1" "Option 2"`\n' +
  'Mode: `single` (one vote) or `multi` (multiple votes, default).\n' +
  'Minimum 2 options, maximum 10.';

/**
 * Registers all poll-related handlers:
 * - /askbot slash command (poll subcommand)
 * - poll_vote_* button actions
 * - poll_close_* button actions
 */
export function registerPollHandler(app: App, logger: Logger): void {
  // --- Slash command: /askbot poll "Q?" "A" "B" ---
  app.command('/askbot', async ({ ack, command, client }) => {
    await ack();

    const { text, user_id: userId, channel_id: channelId } = command;

    if (!text.startsWith('poll')) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'Unknown subcommand. Available: `poll`\n' + USAGE_TEXT,
      });
      return;
    }

    logger.info({ userId, channelId }, 'Poll creation requested');

    const parsed = parsePollCommand(text);
    if (!parsed.success || !parsed.data) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: parsed.error ?? USAGE_TEXT,
      });
      return;
    }

    const { question, options, mode } = parsed.data;

    // Create poll in database
    const pollResult = await createPoll(channelId, userId, question, options, mode);
    if (!pollResult.success || !pollResult.data) {
      logger.error({ err: pollResult.error }, 'Failed to create poll');
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'Failed to create poll. Please try again.',
      });
      return;
    }

    const poll = pollResult.data;

    // Build initial blocks (no votes yet)
    const state: PollState = {
      poll,
      votes: [],
      voterNames: new Map(),
    };
    const blocks = buildPollBlocks(state);

    // Post poll message to channel
    try {
      const postResult = await client.chat.postMessage({
        channel: channelId,
        text: `Poll: ${question}`,
        blocks: blocks as never[],
      });

      // Store the message timestamp for future updates
      if (postResult.ts) {
        await updatePollMessageTs(poll.id, postResult.ts);
      }

      // Send ephemeral close button to creator only
      const closeBlocks = buildClosePollBlocks(poll.id);
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'Close poll controls',
        blocks: closeBlocks as never[],
      });

      logger.info({ pollId: poll.id, channelId }, 'Poll created');
    } catch (error) {
      logger.error({ err: error, pollId: poll.id }, 'Failed to post poll message');
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'Failed to post poll. Please try again.',
      });
    }
  });

  // --- Vote button action: poll_vote_<pollId>_<optionIndex> ---
  app.action(/^poll_vote_/, async ({ ack, body, client }) => {
    await ack();

    const action = (body as { actions?: Array<{ action_id: string }> }).actions?.[0];
    if (!action) return;

    const match = action.action_id.match(/^poll_vote_(.+)_(\d+)$/);
    if (!match?.[1] || !match[2]) return;

    const pollId = match[1];
    const optionIndex = parseInt(match[2], 10);
    const userId = body.user.id;

    logger.info({ pollId, optionIndex, userId }, 'Vote action received');

    // Check if poll is still open
    const pollResult = await getPollById(pollId);
    if (!pollResult.success || !pollResult.data) {
      return;
    }

    if (pollResult.data.closedAt) {
      await client.chat.postEphemeral({
        channel: pollResult.data.channelId,
        user: userId,
        text: 'This poll is closed. No more votes can be cast.',
      });
      return;
    }

    // Toggle vote (pass mode for single-select enforcement)
    const voteResult = await toggleVote(pollId, optionIndex, userId, pollResult.data.mode);
    if (!voteResult.success) {
      logger.error({ err: voteResult.error, pollId }, 'Failed to toggle vote');
      return;
    }

    // Rebuild and update message
    const state = await buildPollState(pollId, logger);
    if (!state || !state.poll.messageTs) return;

    const blocks = buildPollBlocks(state);

    try {
      await client.chat.update({
        channel: state.poll.channelId,
        ts: state.poll.messageTs,
        text: `Poll: ${state.poll.question}`,
        blocks: blocks as never[],
      });
    } catch (error) {
      logger.error({ err: error, pollId }, 'Failed to update poll message');
    }
  });

  // --- Close button action: poll_close_<pollId> ---
  app.action(/^poll_close_/, async ({ ack, body, client }) => {
    await ack();

    const action = (body as { actions?: Array<{ action_id: string }> }).actions?.[0];
    if (!action) return;

    const match = action.action_id.match(/^poll_close_(.+)$/);
    if (!match?.[1]) return;

    const pollId = match[1];
    const userId = body.user.id;

    logger.info({ pollId, userId }, 'Close poll action received');

    // Verify creator
    const pollResult = await getPollById(pollId);
    if (!pollResult.success || !pollResult.data) return;

    if (pollResult.data.creatorId !== userId) {
      await client.chat.postEphemeral({
        channel: pollResult.data.channelId,
        user: userId,
        text: 'Only the poll creator can close this poll.',
      });
      return;
    }

    if (pollResult.data.closedAt) {
      return; // Already closed
    }

    // Close the poll
    const closeResult = await closePoll(pollId);
    if (!closeResult.success) {
      logger.error({ err: closeResult.error, pollId }, 'Failed to close poll');
      return;
    }

    // Rebuild and update message with final results
    const state = await buildPollState(pollId, logger);
    if (!state || !state.poll.messageTs) return;

    const blocks = buildPollBlocks(state);

    try {
      await client.chat.update({
        channel: state.poll.channelId,
        ts: state.poll.messageTs,
        text: `Poll (closed): ${state.poll.question}`,
        blocks: blocks as never[],
      });
      logger.info({ pollId }, 'Poll closed');
    } catch (error) {
      logger.error({ err: error, pollId }, 'Failed to update closed poll message');
    }
  });
}
