# AskBot — Full Implementation Prompt for Developer

> Give this entire file to your dev. They open Claude Code in the project and paste:
> `Read DEV-PROMPT.md and implement everything. Start with the build order at the bottom.`

---

## What to Build

AskBot is an AI-powered Slack knowledge assistant. Users DM the bot with natural language questions.
The bot uses **per-user OAuth** — each user authorizes once, then the bot can search everything
they have access to (channels, DMs, group DMs) using their own token. No `/invite` needed.

## Interaction Model

1. User opens bot DM and types a question
2. Bot checks DB: does this user have a stored token?
3. **NO token** → sends "Connect your account" button (Slack OAuth link)
4. User clicks → Slack OAuth page → clicks "Allow" (one-time)
5. Bot stores user's `xoxp-` token in database
6. **HAS token** → uses `search.messages` with the user's own token
7. Filters results → Claude AI summarizes → sends formatted answer
8. No @mention needed. User just types naturally.

## Architecture

```
User DMs bot: "what did I do today?"
  │
  ▼
Check DB: has user token?
  │
  ├─ NO → Send "Connect your account" Block Kit button
  │       User clicks → Slack OAuth → /auth/callback
  │       Store xoxp- token in PostgreSQL/SQLite
  │       Reply "Connected! Ask me anything."
  │
  └─ YES → search.messages with user's xoxp- token
           → Query parser detects type (personal/channel/mentions/etc)
           → Filter & rank results
           → Claude summarizes with citations
           → Block Kit formatted response
```

## Access Model

Each user's token (`xoxp-`) sees exactly what they see:
- All public channels they're in → searchable
- Private channels they're in → searchable
- Their DMs → searchable
- Group DMs they're in → searchable
- Channels they're NOT in → not visible

This is per-user. No admin needed. No /invite needed.

## Database Layer

### Prisma Schema

Create `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = env("DATABASE_PROVIDER")   // "sqlite" or "postgresql"
  url      = env("DATABASE_URL")
}

model UserToken {
  id        String   @id @default(uuid())
  userId    String   @unique              // Slack user ID (e.g., U0ATQR0JB6J)
  token     String                        // xoxp- user OAuth token
  teamId    String                        // Slack workspace ID
  scopes    String                        // comma-separated granted scopes
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Token Store (`src/db/token-store.ts`)
```typescript
// Functions needed:
getUserToken(userId: string): Promise<string | null>
saveUserToken(userId: string, token: string, teamId: string, scopes: string): Promise<void>
deleteUserToken(userId: string): Promise<void>
```

Use Prisma client. Return Envelope<T> pattern for all operations.

## OAuth Flow

### OAuth Config (`src/auth/oauth-config.ts`)
```typescript
// Build the Slack OAuth authorize URL
// Scopes needed: search:read (user token scope)
// Redirect URI: ${APP_URL}/auth/callback
// State parameter: userId (so we know who authorized)
```

### OAuth Routes (`src/auth/oauth-routes.ts`)

Two HTTP endpoints (use Express alongside Socket Mode):

**GET /auth/install?user_id=xxx**
- Builds Slack OAuth URL with user_id in state param
- Redirects to: https://slack.com/oauth/v2/authorize?client_id=...&user_scope=search:read&redirect_uri=...&state=userId

**GET /auth/callback?code=xxx&state=userId**
- Exchanges code for token: POST https://slack.com/api/oauth.v2.access
- Stores the authed_user.access_token in database
- Shows "Success! Go back to Slack." page

### Wire into App (`src/slack/app.ts`)
- Create Express app for OAuth routes
- Start Express on PORT alongside Socket Mode
- Both run in the same Node.js process

```typescript
import express from 'express';

const httpApp = express();
registerOAuthRoutes(httpApp, config, logger);
httpApp.listen(config.port);
```

## Updated DM Handler (`src/slack/handlers/dm.ts`)

```typescript
// When user sends DM:
// 1. Get user's token from DB
const token = await getUserToken(userId);

// 2. No token → send auth button
if (!token) {
  await client.chat.postMessage({
    channel: event.channel,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: 'To answer your questions, I need access to your Slack data.' }
      },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Connect Your Account' },
          url: `${config.appUrl}/auth/install?user_id=${userId}`,
          style: 'primary',
        }]
      }
    ]
  });
  return;
}

// 3. Has token → search and answer
const userClient = new WebClient(token);
const searchResults = await userClient.search.messages({ query: keywords, count: 20 });
// ... process results, call Claude, format response
```

## Search with User Token (`src/search/user-search.ts`)

Use `search.messages` API with the user's `xoxp-` token:
```typescript
const result = await userClient.search.messages({
  query: searchQuery,      // keywords extracted from question
  sort: 'timestamp',
  sort_dir: 'desc',
  count: 20,
});
```

This searches across ALL channels, DMs, and group DMs the user has access to.

## Query Types to Support

### Category 1: Personal Activity
- "What did I do today?" → search `from:@me` + time filter
- "Summarize my work this week" → search `from:@me` + last 7 days
- "What did I work on yesterday?" → search `from:@me` + yesterday

### Category 2: Unreplied Mentions
- "What mentions do I need to reply to?" → search `to:@me` + check threads
- "Show me unreplied @mentions" → search `has:mention` for user
- "Any @here I missed?" → search `@here` or `@channel`

### Category 3: Channel Summaries
- "Summarize #general today" → search `in:#general` + today
- "What happened in #engineering?" → search `in:#engineering`
- "What did I miss yesterday?" → search all + yesterday

### Category 4: Important / Digest
- "Today's important messages" → search all + sort by reactions/replies
- "Daily digest" → search all today + rank by importance
- "Any announcements?" → search `in:#announcements` or `@here/@channel`

### Category 5: People & Topic Search
- "What did @alice say about deployment?" → search `from:@alice deployment`
- "Who is working on marketing?" → search `marketing`
- "Latest on Project X?" → search `Project X`

## AI Layer (src/ai/)

### prompt-builder.ts
System prompt (cached):
```
You are AskBot, an AI knowledge assistant for a Slack workspace. You answer questions
based ONLY on real Slack messages provided to you.

RULES:
1. ONLY use information from the provided messages. Never fabricate.
2. ALWAYS cite sources: "According to @username in #channel..."
3. Use Slack mrkdwn: *bold*, _italic_, `code`, > blockquote
4. If not enough info, say so and suggest where to look.
5. Keep answers concise: 3-4 short paragraphs max.
6. End with "Sources:" listing channels referenced.
```

### summarizer.ts
- Use @anthropic-ai/sdk
- temperature: 0.3, max_tokens: 1024
- cache_control: { type: "ephemeral" } on system prompt
- Handle rate limits with single retry

## Formatter (src/formatter/slack-blocks.ts)
- Section block: AI answer (split at 2800 chars if long)
- Divider
- Context block: "Sources: #ch1, #ch2 | X messages analyzed"

## Environment Config

### New env vars to add to src/config/env.ts:
```typescript
SLACK_CLIENT_ID: z.string().min(1),
SLACK_CLIENT_SECRET: z.string().min(1),
APP_URL: z.string().url(),
PORT: z.coerce.number().default(3000),
DATABASE_URL: z.string().min(1),
DATABASE_PROVIDER: z.enum(['sqlite', 'postgresql']).default('sqlite'),
```

### Local dev (.env.local):
```
NODE_ENV=development
DATABASE_PROVIDER=sqlite
DATABASE_URL=file:./dev.db
APP_URL=http://localhost:3000
PORT=3000
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514
LOG_LEVEL=debug
RATE_LIMIT_PER_USER_PER_MINUTE=5
```

### Production (Railway dashboard):
```
NODE_ENV=production
DATABASE_PROVIDER=postgresql
DATABASE_URL=(auto-provided by Railway PostgreSQL addon)
APP_URL=https://your-app.up.railway.app
PORT=3000
+ all Slack/Anthropic tokens
```

## File Structure

```
prisma/
  schema.prisma               — UserToken model
src/
  index.ts                    — UPDATE: init Prisma, start Express + Socket Mode
  config/env.ts               — UPDATE: add new env vars
  types/index.ts              — UPDATE: add new types
  db/
    token-store.ts             — NEW: save/get/delete user tokens
  auth/
    oauth-config.ts            — NEW: OAuth URLs and scopes
    oauth-routes.ts            — NEW: /auth/install + /auth/callback
  query/
    query-parser.ts            — NEW: detect query type + extract params
    time-parser.ts             — NEW: "today"/"this week" → timestamps
  search/
    user-search.ts             — NEW: search.messages with user token
    importance-scorer.ts       — NEW: rank messages by importance
  ai/
    prompt-builder.ts          — NEW: system + user prompts per query type
    summarizer.ts              — NEW: Claude API call
  formatter/
    slack-blocks.ts            — NEW: Block Kit response
  slack/
    app.ts                     — UPDATE: add Express for OAuth
    handlers/
      dm.ts                    — UPDATE: token check → auth or search
      mention.ts               — KEEP existing
```

## Build Order

1. `npm install prisma @prisma/client express @types/express` — add dependencies
2. Create `prisma/schema.prisma` + `src/db/token-store.ts` — database layer
3. Run `npx prisma generate` + `npx prisma db push` — create local DB
4. Create `src/auth/oauth-config.ts` + `src/auth/oauth-routes.ts` — OAuth flow
5. Update `src/config/env.ts` — add new env vars
6. Update `src/types/index.ts` — add new types
7. Update `src/slack/app.ts` — add Express server for OAuth
8. Update `src/slack/handlers/dm.ts` — token check → auth or search
9. Create `src/query/query-parser.ts` + `src/query/time-parser.ts` — query parsing
10. Create `src/search/user-search.ts` — search.messages with user token
11. Create `src/ai/prompt-builder.ts` + `src/ai/summarizer.ts` — AI layer
12. Create `src/formatter/slack-blocks.ts` — response formatting
13. Update `src/index.ts` — init Prisma + Express + Socket Mode
14. Run `npm run typecheck && npm test` — verify
15. Create `.env.local` and `.env.production` templates

## Quick Reference

```bash
# Build everything:
"Read DEV-PROMPT.md and implement all steps in the build order."

# Or step by step:
"Read DEV-PROMPT.md and implement steps 1-3 (database layer)"
"Read DEV-PROMPT.md and implement steps 4-7 (OAuth + config)"
"Read DEV-PROMPT.md and implement steps 8-12 (search + AI pipeline)"
"Read DEV-PROMPT.md and implement steps 13-15 (wiring + templates)"
```
