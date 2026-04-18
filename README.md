# AskBot Slack - AI Workspace Knowledge Assistant

An AI-powered Slack bot that answers questions by reading messages across channels and summarizing with Claude AI. Built for the **Build-a-Bot in a Day** hackathon.

## How It Works

1. Admin installs AskBot to the workspace (one click)
2. Invite the bot to channels: `/invite @AskBot`
3. Any user asks: `@AskBot what happened with the deployment?`
4. Bot reads messages from all its channels, finds relevant ones, summarizes with Claude AI
5. Bot responds with a sourced answer citing channels and users

## Quick Start

### Prerequisites

- Node.js 20+
- A Slack workspace (free plan works)
- An Anthropic API key ([get one here](https://console.anthropic.com))

### 1. Clone and install

```bash
git clone https://github.com/Dinesh73567/askbot-slack.git
cd askbot-slack
npm install
```

### 2. Create the Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) > **Create New App** > **From scratch**
2. Name: `AskBot`, select your workspace

### 3. Configure Bot Token Scopes

Go to **OAuth & Permissions** > **Scopes** > **Bot Token Scopes**, add:

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | Receive @AskBot mentions |
| `chat:write` | Post responses |
| `commands` | /askbot slash command |
| `users:read` | Resolve user display names |
| `channels:history` | Read messages in public channels |
| `groups:history` | Read messages in private channels |
| `channels:read` | List public channels |
| `groups:read` | List private channels |
| `im:history` | Read DMs to bot |

### 4. Enable Socket Mode

1. Go to **Socket Mode** in sidebar > **Enable**
2. Create an App-Level Token with `connections:write` scope
3. Save the `xapp-` token

### 5. Set Up Events

1. Go to **Event Subscriptions** > **Enable Events**
2. Under **Subscribe to bot events**, add:
   - `app_mention`
   - `message.im`

### 6. Create Slash Command

1. Go to **Slash Commands** > **Create New Command**
2. Command: `/askbot`
3. Description: `Ask a question about anything in this workspace`
4. Usage hint: `your question here`

### 7. Install to Workspace

1. Go to **Install App** > **Install to Workspace**
2. Click **Allow**
3. Copy the **Bot User OAuth Token** (`xoxb-...`)

### 8. Configure environment

```bash
cp .env.example .env
```

Fill in your `.env`:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret
ANTHROPIC_API_KEY=sk-ant-your-key
```

### 9. Run

```bash
npm run dev
```

### 10. Test it

1. Invite AskBot to a channel: `/invite @AskBot`
2. Type: `@AskBot what's everyone been working on today?`

## Using Claude Code to Develop

This project includes ECC (Everything Claude Code) agents, rules, and configurations.

```bash
# Start Claude Code in the project
cd askbot-slack
claude

# Inside Claude Code, use these workflows:
> /plan "Add channel message fetching"    # Plan before coding
> /tdd                                     # Test-driven development
> /code-review                             # Review code quality
> /build-fix                               # Fix build errors
```

### Included ECC agents

| Agent | When to use |
|-------|-------------|
| `planner` | Planning new features |
| `code-reviewer` | Before committing code |
| `tdd-guide` | Writing tests first |
| `architect` | Design decisions |
| `security-reviewer` | Security audit |
| `build-error-resolver` | Fixing build errors |

## Architecture

```
@AskBot "question"
    |
    v
Strip mention, extract question
    |
    v
conversations.list (get bot's channels)
    |
    v
conversations.history (fetch messages from each channel)
    |
    v
Filter & rank by keyword relevance
    |
    v
Build Claude prompt (grouped by #channel)
    |
    v
Claude AI summarizes with citations
    |
    v
Format as Slack Block Kit
    |
    v
Post response
```

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Slack:** Bolt framework (Socket Mode)
- **AI:** Anthropic Claude API
- **Validation:** Zod
- **Logging:** Pino
- **Testing:** Vitest

## License

MIT
