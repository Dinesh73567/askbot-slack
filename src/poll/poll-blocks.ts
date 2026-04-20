import type { PollState } from '../types/index.js';

/** Block Kit block types used by poll messages */
export type PollBlock =
  | {
      readonly type: 'section';
      readonly text: { readonly type: 'mrkdwn'; readonly text: string };
      readonly accessory?: {
        readonly type: 'button';
        readonly text: { readonly type: 'plain_text'; readonly text: string };
        readonly action_id: string;
        readonly value: string;
      };
    }
  | { readonly type: 'divider' }
  | {
      readonly type: 'actions';
      readonly elements: ReadonlyArray<{
        readonly type: 'button';
        readonly text: { readonly type: 'plain_text'; readonly text: string };
        readonly action_id: string;
        readonly style?: 'danger';
      }>;
    }
  | {
      readonly type: 'context';
      readonly elements: ReadonlyArray<{
        readonly type: 'mrkdwn';
        readonly text: string;
      }>;
    };

/**
 * Build the voter display string for a given option index.
 * Uses Slack @mention format (<@userId>) so names render as clickable mentions.
 */
function buildVoterText(
  optionIndex: number,
  state: PollState,
): string {
  const voters = state.votes
    .filter((v) => v.optionIndex === optionIndex)
    .map((v) => `<@${v.userId}>`);

  if (voters.length === 0) return 'No votes yet';
  return `${voters.join(', ')} (${voters.length})`;
}

/**
 * Build Block Kit blocks for a poll message.
 * Shows options with vote buttons (if open) and voter names.
 */
export function buildPollBlocks(state: PollState): readonly PollBlock[] {
  const { poll } = state;
  const isClosed = poll.closedAt !== null;
  const totalVotes = state.votes.length;

  const blocks: PollBlock[] = [];

  // Question header (using section+mrkdwn to avoid header's 150-char limit)
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `*:bar_chart: ${poll.question}*` },
  });

  // Option rows
  for (let i = 0; i < poll.options.length; i++) {
    const option = poll.options[i];
    const voterText = buildVoterText(i, state);
    const sectionText = `*${option}*\n${voterText}`;

    if (isClosed) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: sectionText },
      });
    } else {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: sectionText },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Vote' },
          action_id: `poll_vote_${poll.id}_${i}`,
          value: String(i),
        },
      });
    }
  }

  blocks.push({ type: 'divider' });

  // Footer context (close button is sent as ephemeral to creator only)
  const statusText = isClosed ? 'Poll closed' : 'Poll open';
  const modeText = poll.mode === 'single' ? 'Single select' : 'Multi select';
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `${statusText} | ${modeText} | Poll by <@${poll.creatorId}> | ${totalVotes} total vote${totalVotes === 1 ? '' : 's'}`,
      },
    ],
  });

  return blocks;
}

/**
 * Build ephemeral blocks with a "Close Poll" button.
 * Only sent to the poll creator so only they can see it.
 */
export function buildClosePollBlocks(pollId: string): readonly PollBlock[] {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'You can close this poll when voting is done.' },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Close Poll' },
          action_id: `poll_close_${pollId}`,
          style: 'danger',
        },
      ],
    },
  ];
}
