# AskBot Agents

> This file is read by Claude Code, Cursor, Codex CLI, and other AI tools automatically.
> It tells the AI assistant how to work on this project.

## Project: AskBot Slack

AI-powered Slack bot that answers questions by searching workspace messages and summarizing with Claude AI.

## Architecture

Slack (dumb pipe) -> Backend (all intelligence):
1. RECEIVE: Bolt app extracts question from @mention or /askbot
2. SEARCH: Fetch messages from bot's channels, filter by keyword relevance
3. AI: Claude summarizes with citations (@user in #channel)
4. FORMAT: Block Kit response posted back to Slack

## How to Build

Read `PLAN.md` for the step-by-step implementation plan. Each step is independently testable.

Quick start: "Follow PLAN.md Step 1" to get the bot online.

## Key Rules

- Bot token only (xoxb-), no user token
- Socket Mode (no server needed)
- All async functions return Envelope<T> = { success, data, error }
- All types are readonly/immutable
- No console.log, use pino logger
- Max 400 lines per file
- Tests first (TDD), 80% coverage minimum
- Conventional commits: feat:, fix:, test:

## Available Agents

| Agent | Use When |
|-------|----------|
| askbot-builder | Building any AskBot feature (auto-activated) |
| planner | Planning new features before coding |
| code-reviewer | Reviewing code quality before committing |
| tdd-guide | Writing tests first |
| security-reviewer | Checking for security issues |
| build-error-resolver | Fixing build/compile errors |
| architect | Making design decisions |

## Stack

- Node.js 20+ / TypeScript (strict)
- @slack/bolt (Socket Mode)
- @anthropic-ai/sdk (Claude API)
- zod (validation)
- pino (logging)
- vitest (testing)
