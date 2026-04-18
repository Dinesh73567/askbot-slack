# AskBot — Full Implementation Prompt for Developer

> Give this entire file to your dev. They open Claude Code in the project and paste this prompt.
> This replaces the step-by-step PLAN.md approach with a single comprehensive build instruction.

---

## Prompt to give your dev:

```
Read CLAUDE.md and PLAN.md first for project context. Then implement the full AskBot as described below.
Build incrementally — get each layer working before moving to the next. Run npm run typecheck after each file.

## What to Build

AskBot is an AI-powered Slack knowledge assistant. Users DM the bot with natural language questions. 
The bot searches across ALL accessible Slack data, uses Claude AI to generate an intelligent answer, 
and replies in the DM. No @mention needed — user just types a message to the bot.

## Interaction Model

User opens the bot's DM (clicks "Ask Slack bot" under Apps in sidebar) and types any question naturally.
No slash commands. No @mentions. Just type and get an answer.

Example:
  User: "Give me today's important messages"
  Bot: Searches all channels → filters important ones → Claude summarizes → sends formatted answer

## Access Model (What the Bot Can Read)

The bot should read ALL data it has access to via its bot token scopes:

1. **All public channels** the bot is a member of (conversations.list + conversations.history)
2. **All private channels** the bot is invited to (groups:history)  
3. **Thread replies** in those channels (conversations.replies)
4. **User profiles** for resolving names (users.list, users.info)

Implementation:
- On startup (and every 10 minutes), cache the full channel list via conversations.list
- Cache user list via users.list (map user IDs to display names)
- When a question comes in, fetch messages from relevant channels based on the query
- Use conversations.replies to get thread context when needed
- For time-based queries, use the oldest/latest params in conversations.history

Important Slack API details:
- conversations.list: use types='public_channel,private_channel', exclude_archived=true
- conversations.history: use oldest param (unix timestamp) to filter by time
- conversations.replies: pass channel + ts to get full thread
- users.list: cache this on startup, refresh every 30 min
- Rate limits: Slack allows ~50 req/min for Tier 3 methods. Use Promise.all with batching (max 5 concurrent)

## Core Use Cases to Support

### Category 1: Personal Activity
Questions like:
- "What did I do today?"
- "Summarize my work this week"
- "What messages did I send yesterday?"
- "Show my activity in #engineering this week"

How to handle:
- Identify the asking user's ID from the message event
- Filter messages where userId matches the asking user
- Filter by detected time range (today/yesterday/this week/this month)
- Group by channel, summarize with Claude

### Category 2: Unreplied Mentions & Action Items
Questions like:
- "What messages mention me that I haven't replied to?"
- "Show me my pending @mentions"
- "Any messages with @here or @channel I missed?"
- "What needs my attention?"

How to handle:
- Search for messages containing <@USER_ID> (direct mention), <!here>, <!channel>, <!everyone>
- For each found message, check if the user has replied in the thread (conversations.replies)
- If no reply from the user exists, include it as "unreplied"
- Sort by urgency: direct mention > @here > @channel
- Claude summarizes what needs attention

### Category 3: Channel Summaries
Questions like:
- "Summarize #general today"
- "What happened in #engineering this week?"
- "Give me updates from all channels today"
- "What did I miss yesterday?"

How to handle:
- Detect channel name in the query (#channel-name pattern)
- If specific channel: fetch that channel's history for the time range
- If "all channels" or no specific channel: fetch from all channels, merge, sort by time
- Claude summarizes key discussions, decisions, and updates

### Category 4: Important Messages / Daily Digest
Questions like:
- "What are today's important messages?"
- "Any announcements today?"
- "What's urgent right now?"
- "Give me a daily digest"

How to handle:
- Fetch messages from all channels for the time range
- Score importance: messages with @here/@channel/@everyone = high, messages with many reactions = high, 
  messages with many thread replies = high, messages in #announcements or #important channels = high
- Filter to top important messages
- Claude generates a prioritized digest

### Category 5: People & Topic Search
Questions like:
- "What did @alice say about the deployment?"
- "Who is working on marketing?"
- "What's the latest on Project X?"
- "Any discussion about the deadline?"

How to handle:
- Extract keywords and person mentions from the query
- If person mentioned: filter to their messages
- Score all messages by keyword relevance
- Claude answers with citations

### Category 6: Thread Deep Dive
Questions like:
- "Summarize the thread about database migration"
- "What was decided in the deployment discussion?"

How to handle:
- Search for messages matching keywords
- For top matches, fetch full thread via conversations.replies
- Include all thread replies in the Claude prompt
- Claude summarizes the discussion and any decisions made

## Architecture

### Layer 1: Message Receiver (src/slack/)
- Listen for `message` event (DM to bot) — NOT app_mention
- No @mention needed. User just types in the bot's DM
- Parse the raw message text
- Post a "thinking" indicator (chat.postMessage with "Analyzing your question...")
- Pass to the query processor

### Layer 2: Query Processor (src/query/)
- Detect query type: personal_activity | unreplied_mentions | channel_summary | important_messages | people_search | topic_search | thread_dive
- Extract parameters: time range, target user, target channel, keywords
- Time detection: "today" = last 24h, "yesterday" = 24-48h, "this week" = last 7 days, "this month" = last 30 days
- Person detection: @username references
- Channel detection: #channel-name references

Create this file: src/query/query-parser.ts
```typescript
interface ParsedQuery {
  readonly type: 'personal_activity' | 'unreplied_mentions' | 'channel_summary' | 
                 'important_messages' | 'people_search' | 'topic_search' | 'thread_dive';
  readonly timeRange: { oldest: number; latest: number };
  readonly targetUserId: string | null;
  readonly targetChannel: string | null;
  readonly keywords: readonly string[];
  readonly rawQuestion: string;
}
```

### Layer 3: Data Fetcher (src/search/)
- channel-fetcher.ts: Fetch channels and messages based on ParsedQuery
- mention-tracker.ts: Find unreplied mentions for a user
- thread-fetcher.ts: Fetch full thread replies
- importance-scorer.ts: Score messages by importance (reactions, replies, @here/@channel)
- user-cache.ts: Cache user ID → display name mapping

All functions return Envelope<T> pattern.

### Layer 4: AI Summarizer (src/ai/)
- prompt-builder.ts: Build different prompts based on query type
- summarizer.ts: Call Claude API with prompt caching

System prompt (use for ALL queries, cache this):
```
You are AskBot, an AI knowledge assistant for a Slack workspace. Users ask you questions
about their work, team activity, and organizational updates. You answer based ONLY on 
real Slack messages provided to you.

RULES:
1. ONLY use information from the provided messages. Never fabricate information.
2. ALWAYS cite sources: mention the person and channel — "According to @alice in #engineering..."
3. Use Slack mrkdwn formatting: *bold*, _italic_, `code`, > blockquote, bullet lists with •
4. Structure your answers clearly with sections when appropriate.
5. If not enough information is found, say so honestly and suggest where to look.
6. For activity summaries, organize chronologically and group by theme/project.
7. For unreplied mentions, list them with urgency level and recommended action.
8. For digests, prioritize by importance: decisions > announcements > discussions > FYI.
9. Keep answers concise but complete. Max 4-5 short paragraphs.
10. Always include a "Sources" line at the end listing channels referenced.
```

Query-specific user prompts:

For personal_activity:
```
The user (USER_NAME, ID: USER_ID) is asking about their own activity.
Question: {question}

Here are their messages found across the workspace:
{messages grouped by channel with timestamps}

Summarize their activity. Group by project/theme, include key contributions and discussions.
```

For unreplied_mentions:
```
The user (USER_NAME, ID: USER_ID) wants to know about messages that mention them 
which they haven't replied to yet.

UNREPLIED MENTIONS:
{list of messages mentioning the user, with channel, sender, time, and thread status}

List each unreplied mention with:
- Who sent it and in which channel
- What they said (brief)
- How urgent it seems (high/medium/low)
- Suggested action
```

For channel_summary:
```
The user wants a summary of activity in {channel_name(s)} for {time_range}.
Question: {question}

MESSAGES:
{messages grouped by channel}

Summarize the key discussions, decisions, and updates. Group by topic/theme.
```

For important_messages:
```
The user wants to see important messages from {time_range}.
Question: {question}

HIGH IMPORTANCE MESSAGES (many reactions, @here/@channel, announcements):
{important messages}

OTHER NOTABLE MESSAGES:
{other messages}

Create a prioritized digest. Lead with the most important items.
Categorize as: Urgent | Announcements | Decisions | FYI
```

### Layer 5: Response Formatter (src/formatter/)
- Format Claude's response as Slack Block Kit
- Header with query type icon
- Main answer in section blocks (split at 2800 chars)
- Sources footer with channels referenced
- Timestamp of when the analysis was done

## File Structure to Create

```
src/
  slack/
    app.ts                      — UPDATE: add message listener for DMs
    handlers/
      mention.ts                — KEEP: for @mention in channels (existing)
      dm-handler.ts             — NEW: handle DM messages (main entry point)
  query/
    query-parser.ts             — NEW: parse question into ParsedQuery
    query-parser.test.ts        — NEW: tests
    time-parser.ts              — NEW: "today"/"this week" → unix timestamps
    time-parser.test.ts         — NEW: tests
  search/
    channel-fetcher.ts          — NEW: fetch channels and messages
    mention-tracker.ts          — NEW: find unreplied mentions
    thread-fetcher.ts           — NEW: fetch thread replies
    importance-scorer.ts        — NEW: score message importance
    user-cache.ts               — NEW: cache user ID → name
  ai/
    prompt-builder.ts           — NEW: build prompts per query type
    summarizer.ts               — NEW: call Claude API
  formatter/
    slack-blocks.ts             — NEW: Block Kit response builder
  types/
    index.ts                    — UPDATE: add ParsedQuery, ImportanceScore types
```

## Event Subscription Required

The Slack app needs this bot event subscribed (tell the app admin):
- `message.im` — to receive DM messages to the bot

This is critical. Without message.im, the bot cannot receive DMs.

## Build Order

1. First: query/time-parser.ts + query/query-parser.ts (with tests)
2. Then: search/user-cache.ts + search/channel-fetcher.ts
3. Then: search/mention-tracker.ts + search/importance-scorer.ts + search/thread-fetcher.ts
4. Then: ai/prompt-builder.ts + ai/summarizer.ts
5. Then: formatter/slack-blocks.ts
6. Then: slack/handlers/dm-handler.ts (wire everything together)
7. Then: update slack/app.ts to register the DM handler
8. Finally: run npm run typecheck && npm test

## Testing

Write tests for: query-parser, time-parser, importance-scorer, prompt-builder, formatter.
Mock Slack API and Anthropic SDK in tests. Target 80% coverage.
```

---

## Use Case Reference (All Supported Queries)

### Personal
- "What did I do today?"
- "Summarize my work this week"
- "What did I work on yesterday?"
- "Show my activity in #engineering"

### Unreplied / Action Items
- "What mentions do I need to reply to?"
- "Show me unreplied @mentions"
- "Any @here or @channel messages I missed?"
- "What needs my attention?"
- "List messages mentioned for all users that I haven't replied to"

### Channel Summaries
- "Summarize #general today"
- "What happened in #engineering this week?"
- "What did I miss yesterday?"
- "Give me updates from all channels"

### Daily Digest / Important
- "What are today's important messages?"
- "Give me a daily digest"
- "Any announcements today?"
- "What's urgent right now?"

### People & Topic Search
- "What did @alice say about deployment?"
- "Who is working on marketing?"
- "What's the latest on Project X?"
- "Did anyone mention the deadline?"
- "Any discussion about the database?"

### Thread Summaries
- "Summarize the deployment discussion"
- "What was decided about the new feature?"
