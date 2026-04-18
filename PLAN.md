# AskBot Implementation Plan

> This is the step-by-step build plan. Tell Claude Code: "Follow PLAN.md step X" to build each part.
> Each step is independently testable. Complete them in order.

---

## Architecture (Simple)

```
SLACK (dumb pipe)              BACKEND (all the brains)
─────────────────              ──────────────────────────
User types @AskBot question -> Layer 1: RECEIVE (extract question)
                                Layer 2: SEARCH (fetch & filter messages)  
                                Layer 3: AI (Claude summarizes)
User sees answer            <- Layer 4: FORMAT (Block Kit response)
```

Slack does NOTHING. All intelligence is in the backend.

---

## What's Already Built

- `src/config/env.ts` - Zod-validated environment config
- `src/types/index.ts` - All TypeScript interfaces (readonly, immutable)
- `src/utils/envelope.ts` - ok() and fail() helpers for Envelope pattern
- `src/utils/errors.ts` - Custom error classes (AskBotError, SlackApiError, AIError, etc.)
- `src/utils/logger.ts` - Pino structured logger
- `src/index.ts` - Entry point (partial, has TODOs)

---

## Step 1: Get the Bot Online (Slack App + Echo Handler)

**Goal:** Bot connects to Slack and replies "I heard you" when mentioned.

**Files to create:**
1. `src/slack/app.ts` - Bolt app factory with Socket Mode
2. `src/slack/handlers/mention.ts` - Handle `app_mention` events, strip bot mention, echo back
3. Update `src/index.ts` - Import createApp, start it, wire shutdown

**Key details:**
- Use `@slack/bolt` App with `socketMode: true`
- Pass `token` (bot token), `appToken` (app-level token), `signingSecret`
- Register `app.event('app_mention', ...)` handler
- Strip the `<@BOT_ID>` from the message text to get raw question
- Reply with `say()` for now: "I heard: {question}"

**Test:** `npm run dev` -> mention @AskBot in Slack -> get echo reply

---

## Step 2: Fetch Messages from Channels

**Goal:** Bot fetches messages from all channels it's invited to.

**Files to create:**
1. `src/search/channel-fetcher.ts`

**Key details:**
- `fetchBotChannels(client)`: Call `conversations.list` with `types: 'public_channel,private_channel'` to get channels bot is in. Cache result for 5 minutes using a simple `Map` with TTL.
- `fetchChannelMessages(client, channelId, oldest)`: Call `conversations.history` with `oldest` timestamp (e.g., 24 hours ago). Fetch up to 200 messages per channel.
- `fetchAllMessages(client)`: Combine both - get channels, then fetch messages from each in parallel with `Promise.all`. Resolve user IDs to display names via `users.info` (cache these too).
- Return `Envelope<SlackMessage[]>`

**Test:** Update mention handler to call fetchAllMessages and reply: "Found {count} messages across {channels} channels"

---

## Step 3: Filter Messages by Relevance

**Goal:** From hundreds of messages, find the 15 most relevant to the user's question.

**Files to create:**
1. `src/search/keyword-matcher.ts`
2. `src/search/result-ranker.ts`

**Key details for keyword-matcher:**
- `extractKeywords(question)`: Remove stop words (the, a, is, what, how, did, etc.), return array of lowercase keywords
- Detect time phrases: "today" -> last 24h, "yesterday" -> 24-48h ago, "this week" -> last 7 days, "last week" -> 7-14 days ago
- Detect personal queries: "I", "my", "me" -> filter to only the asking user's messages
- Detect channel queries: "#channel-name" -> filter to that specific channel
- `scoreMessage(message, keywords)`: Count keyword matches in message text, give bonus for exact phrase match, return 0-1 relevance score

**Key details for result-ranker:**
- `rankResults(messages, keywords)`: Score each message, filter score > 0, sort by score descending
- Deduplicate by timestamp (same message won't appear twice)
- Cap at top 15 results
- `groupByChannel(results)`: Group into `GroupedResults[]` for the AI prompt

**Test:** Ask @AskBot "what happened with deployment?" -> reply with "Found {count} relevant messages about: deployment"

---

## Step 4: AI Summarization with Claude

**Goal:** Send filtered messages to Claude API, get an intelligent answer.

**Files to create:**
1. `src/ai/prompt-builder.ts`
2. `src/ai/summarizer.ts`

**Key details for prompt-builder:**

System prompt (this stays the same for every request — cache it):
```
You are AskBot, a Slack workspace knowledge assistant. Users ask you questions 
and you answer based on real messages from their Slack workspace.

RULES:
1. ONLY use information from the provided messages. Never fabricate or assume.
2. ALWAYS cite sources: "According to @username in #channel-name..."
3. Use Slack mrkdwn: *bold*, _italic_, `code`, > blockquote, bullet lists
4. If messages don't contain enough info, say so honestly and suggest who/where to ask.
5. Keep answers concise: 2-4 paragraphs max.
6. If messages show conflicting info, present all sides.
7. For personal summaries ("what did I do"), organize by time and activity.
8. For channel summaries, group by topic/theme.
```

User prompt template:
```
QUESTION: {question}

MESSAGES ({count} messages from {channelCount} channels):

=== #channel-name ===
[@username, April 18 2026 10:30 AM]:
{message text, truncated to 500 chars}

[@username2, April 18 2026 11:15 AM]:
{message text}

=== #another-channel ===
...

Based on these messages, answer the question.
```

**Key details for summarizer:**
- Use `@anthropic-ai/sdk` Anthropic client
- `summarize(client, question, groupedResults, model)`: 
  - Build messages array with system prompt (use `cache_control: { type: "ephemeral" }`)
  - Temperature: 0.3, max_tokens: 1024
  - Return `Envelope<AISummary>`
- Handle errors: rate limits (retry once after 2s), auth errors, overloaded

**Test:** Ask @AskBot a real question -> get a Claude-generated answer with citations

---

## Step 5: Format Response as Block Kit

**Goal:** Make the answer look polished in Slack.

**Files to create:**
1. `src/formatter/slack-blocks.ts`

**Key details:**
- `formatResponse(summary)`: Build Slack Block Kit blocks array:
  1. Section block: The AI answer text (mrkdwn)
  2. Divider
  3. Context block: "Sources: #channel1, #channel2 | {count} messages analyzed | Powered by Claude"
- Handle 3000-char limit per section block: if answer > 2800 chars, split into multiple section blocks at paragraph boundaries
- `formatErrorResponse(error)`: Simple error message block
- `formatThinkingResponse()`: "Searching across channels..." with a loading indicator

**Test:** Ask a question -> see nicely formatted response with sources footer

---

## Step 6: Slash Command + Rate Limiting + Shared Pipeline

**Goal:** Add `/askbot` command, prevent spam, refactor shared logic.

**Files to create:**
1. `src/slack/handlers/pipeline.ts` - Shared logic for both handlers
2. `src/slack/handlers/command.ts` - /askbot slash command
3. `src/slack/middleware/rate-limit.ts` - Per-user throttle

**Key details for pipeline:**
- `handleQuestion(client, anthropic, question, userId, channelId, respond)`:
  - This is the shared function both mention and command handlers call
  - Runs: rate limit check -> fetch messages -> filter/rank -> AI summarize -> format -> respond
  - Handles all errors and sends user-friendly error messages

**Key details for command:**
- Register `app.command('/askbot', ...)`
- Must call `await ack()` immediately (Slack requires < 3 seconds)
- Then run the pipeline with `respond()` for the answer

**Key details for rate-limit:**
- In-memory `Map<string, number[]>` keyed by userId
- Sliding window: keep timestamps of last N requests within 1 minute
- Default: 5 requests per user per minute
- Return `Envelope<boolean>` — fail() with friendly message if exceeded

**Test:** Use `/askbot` command -> get answer. Spam 6 times -> get rate limit message.

---

## Step 7: Tests + Polish

**Goal:** Add tests, handle edge cases, clean up.

**Files to create:**
1. `src/search/keyword-matcher.test.ts`
2. `src/search/result-ranker.test.ts`
3. `src/ai/prompt-builder.test.ts`
4. `src/formatter/slack-blocks.test.ts`
5. `src/slack/middleware/rate-limit.test.ts`
6. `tests/integration/pipeline.test.ts`

**Test cases to cover:**
- Keyword extraction: stop words removed, time phrases detected, personal queries identified
- Result ranking: deduplication works, capped at 15, grouped by channel
- Prompt builder: system prompt is correct, user prompt formats messages properly
- Formatter: handles long answers (split), handles empty answers, error format
- Rate limiter: allows under limit, blocks over limit, window slides correctly
- Pipeline integration: mock Slack + Claude APIs, verify end-to-end flow

**Polish:**
- Add index.ts re-export files for each module folder
- Update `src/index.ts` to remove TODOs
- Handle edge case: no messages found -> helpful response
- Handle edge case: bot not in any channels -> "Please invite me to channels first"
- Handle edge case: empty question -> "Please ask me a question!"

---

## Quick Reference: What to Say to Claude Code

```bash
# Build step by step:
"Follow PLAN.md Step 1 — get the bot online with an echo handler"
"Follow PLAN.md Step 2 — build the channel message fetcher"
"Follow PLAN.md Step 3 — build keyword matching and result ranking"
"Follow PLAN.md Step 4 — build the Claude AI summarization"
"Follow PLAN.md Step 5 — build the Block Kit formatter"
"Follow PLAN.md Step 6 — add slash command, rate limiting, shared pipeline"
"Follow PLAN.md Step 7 — add tests and polish"

# Or build everything at once:
"Read PLAN.md and implement all 7 steps. Start with Step 1."

# After building, verify:
"Run npm run typecheck and npm test to verify everything works"
```
