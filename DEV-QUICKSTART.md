# Developer Quick Start

> You are a developer on the AskBot hackathon team. Follow these steps to start building.

## 1. Setup (5 minutes)

```bash
# Clone the project
git clone https://github.com/Dinesh73567/askbot-slack.git
cd askbot-slack

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Get the tokens from your team lead and fill in .env
```

## 2. Open Claude Code

```bash
claude
```

That's it. Claude Code will automatically read CLAUDE.md, PLAN.md, and all the agents/rules. It already knows:
- The full project architecture
- What code exists and what's missing
- How to build each module step by step
- The coding standards and patterns to follow

## 3. Tell Claude Code What to Build

### Option A: Build step by step (recommended)

```
Follow PLAN.md Step 1 — get the bot online with an echo handler
```

Wait for it to finish, test it, then:

```
Follow PLAN.md Step 2 — build the channel message fetcher
```

Continue through Steps 3-7.

### Option B: Build everything at once

```
Read PLAN.md and implement all remaining steps. Start from Step 1.
```

### Option C: Check what's done

```
What's the current status? Check which PLAN.md steps have been implemented.
```

## 4. Test Your Work

```bash
# Check types
npm run typecheck

# Run tests
npm test

# Start the bot locally
npm run dev
```

## 5. Useful Claude Code Commands

| What you want | What to type |
|---------------|-------------|
| Plan a feature | `/plan "description of what you want"` |
| Review code before committing | `/code-review` |
| Fix build errors | `/build-fix` |
| Write tests first | `/tdd` |
| Free up context window | `/compact` |

## 6. Important Things to Know

- **Slack does nothing.** All logic is in the backend. Slack is just input/output.
- **Bot token only.** We use `xoxb-` token, not user tokens. No OAuth needed.
- **Socket Mode.** Bot runs on your laptop, no server needed.
- **Envelope pattern.** Every async function returns `{ success, data, error }`.
- **Immutable.** Never mutate objects. Use spread operator.
- **No console.log.** Use the pino logger.

## 7. Commit Convention

```bash
git add <files>
git commit -m "feat: add channel message fetcher"
# Types: feat, fix, test, refactor, docs, chore
```
