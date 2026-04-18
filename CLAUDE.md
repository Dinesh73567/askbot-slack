# AskBot Slack - AI Workspace Knowledge Assistant

## Auto Instructions for Claude Code

When a developer opens this project with Claude Code, follow these rules:

1. **First session:** Read this CLAUDE.md fully, then read DEV-PROMPT.md for the full implementation spec
2. **When dev says "build step X"** or **"follow DEV-PROMPT.md step X":** Read DEV-PROMPT.md, find that step, implement it completely with tests
3. **When dev says "build everything":** Read DEV-PROMPT.md, check what's already implemented in src/, build remaining steps in order
4. **When dev says "what's the status":** List which PLAN.md steps are done (have code) vs remaining (empty dirs or TODOs)
5. **Before writing any code:** Read src/types/index.ts for interfaces, src/utils/envelope.ts for the Envelope pattern, and existing code in the same module
6. **After writing code:** Run `npm run typecheck` and `npm test` to verify
7. **Use the askbot-builder agent** (in .claude/agents/) for any implementation work — it has full context on Slack API patterns and Claude API patterns

## Project Overview

**Stack:** Node.js 20+, TypeScript, Slack Bolt (Socket Mode), Anthropic Claude API, Zod, Pino, Vitest

**What it does:** A Slack bot that answers any question by searching the user's accessible Slack messages and summarizing with Claude AI. Users just DM the bot — no @mention needed.

**Architecture:** Per-user OAuth. Each user authorizes once → bot stores their `xoxp-` token in database → uses `search.messages` with their token to search everything they can see. Socket Mode for events + Express for OAuth callback. PostgreSQL in prod (Railway), SQLite for local dev.

## Core Use Cases

1. **Personal Activity:** "What did I do today?" — filters to user's own messages, summarizes
2. **Channel Summary:** "Summarize #general" — fetches channel messages, summarizes key points
3. **Smart Q&A:** "What's the latest on Project X?" — searches across all channels, finds relevant messages
4. **Catch-up:** "What did I miss yesterday?" — filters by time range, summarizes highlights

## Critical Rules

### 1. Slack API - IMPORTANT

- This bot uses **bot token only** (`xoxb-`), NO user token (`xoxp-`)
- Use `conversations.list` to get channels the bot is in
- Use `conversations.history` to read messages from those channels
- Use `users.info` to resolve user IDs to display names
- Bot must be invited to channels via `/invite @AskBot`
- Always handle Slack rate limits (429) with retry-after header
- Always `ack()` slash commands within 3 seconds, then process async

### 2. Code Organization

- Many small files over few large files
- 200-400 lines typical, 800 max per file
- Organize by feature/domain (slack/, search/, ai/, formatter/)
- Each folder has an index.ts that re-exports public API

### 3. Code Style

- No emojis in code, comments, or documentation
- Immutability always - use `readonly` on interfaces, spread operator, never mutate
- No `console.log` - use pino logger
- Input validation with Zod
- All interfaces use `readonly` properties

### 4. Envelope Pattern (use for all async operations)

```typescript
interface Envelope<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: string | null;
}
const ok = <T>(data: T): Envelope<T> => ({ success: true, data, error: null });
const fail = <T>(error: string): Envelope<T> => ({ success: false, data: null, error });
```

### 5. Testing

- TDD: Write tests first
- 80% minimum coverage
- Unit tests co-located: `foo.ts` -> `foo.test.ts`
- Integration tests in `tests/integration/`
- Mock Slack API and Anthropic SDK in tests

### 6. Security

- No hardcoded secrets - use environment variables
- Validate all env vars at startup with Zod (fail fast)
- Never log message content or tokens
- Rate limit per user to prevent abuse

## File Structure

```
src/
  index.ts                    # Entry point: bootstrap + graceful shutdown
  config/
    env.ts                    # Zod-validated env vars
  slack/
    app.ts                    # Bolt app factory
    handlers/
      mention.ts              # @AskBot mention handler (main pipeline)
      command.ts              # /askbot slash command handler
    middleware/
      rate-limit.ts           # Per-user rate limiting
  search/
    channel-fetcher.ts        # Fetch messages from bot's channels
    keyword-matcher.ts        # Filter relevant messages by keywords
    result-ranker.ts          # Rank and deduplicate results
  ai/
    prompt-builder.ts         # Build system + user prompts for Claude
    summarizer.ts             # Call Claude API with prompt caching
  formatter/
    slack-blocks.ts           # Build Block Kit response
  types/
    index.ts                  # All TypeScript interfaces
  utils/
    logger.ts                 # Pino logger setup
    errors.ts                 # Custom error classes
    envelope.ts               # Envelope helpers (ok, fail)
```

## Core Flow

```
User asks @AskBot "question"
  -> Strip mention, extract question
  -> Post "Searching..." ephemeral message
  -> Fetch channels bot is in (conversations.list)
  -> Fetch recent messages from each channel (conversations.history)
  -> Filter messages matching question keywords
  -> Rank by relevance, cap at top 15
  -> Build Claude prompt with messages grouped by channel
  -> Claude summarizes with citations (@user in #channel)
  -> Format as Slack Block Kit
  -> Post response
```

## Environment Variables

```bash
SLACK_BOT_TOKEN=xoxb-...       # Bot User OAuth Token
SLACK_APP_TOKEN=xapp-...       # App-Level Token (Socket Mode)
SLACK_SIGNING_SECRET=...       # Signing secret
ANTHROPIC_API_KEY=sk-ant-...   # Anthropic API key
CLAUDE_MODEL=claude-sonnet-4-20250514  # Model to use
LOG_LEVEL=info                 # debug|info|warn|error
```

## Commands

- `npm run dev` - Start with hot reload (tsx watch)
- `npm run build` - Compile TypeScript
- `npm start` - Run compiled JS
- `npm test` - Run vitest
- `npm run test:watch` - Vitest watch mode
- `npm run typecheck` - tsc --noEmit
- `npm run lint` - ESLint

## Bot Token Scopes Required

```
app_mentions:read    - Receive @AskBot mentions
chat:write           - Post responses
commands             - /askbot slash command
users:read           - Resolve user display names
channels:history     - Read messages in public channels bot is in
groups:history       - Read messages in private channels bot is in
channels:read        - List public channels
groups:read          - List private channels bot is in
im:history           - Read DMs sent to bot
```

## Git Workflow

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Feature branches from `main`
- PRs require review
- All tests must pass before merge

## ECC Tools Included

This project ships with agents and rules from Everything Claude Code:

**Agents** (in `.claude/agents/`):
- `planner` - Plan features before coding
- `architect` - System design decisions
- `code-reviewer` - Review code quality + security
- `tdd-guide` - Test-driven development
- `build-error-resolver` - Fix build errors
- `security-reviewer` - Security vulnerability analysis
- `e2e-runner` - End-to-end testing
- `code-simplifier` - Simplify complex code
- `doc-updater` - Update documentation

**Rules** (in `.claude/rules/` and `.cursor/rules/`):
- Common: security, testing, patterns, git workflow, coding style, performance
- TypeScript: TS-specific coding style, patterns, security, testing, hooks
