import { z } from 'zod';
import type { AppConfig } from '../types/index.js';

const envSchema = z.object({
  SLACK_BOT_TOKEN: z.string().startsWith('xoxb-', 'Must be a bot token (xoxb-)'),
  SLACK_APP_TOKEN: z.string().startsWith('xapp-', 'Must be an app token (xapp-)'),
  SLACK_SIGNING_SECRET: z.string().min(1, 'Signing secret is required'),
  SLACK_CLIENT_ID: z.string().min(1, 'Slack client ID is required'),
  SLACK_CLIENT_SECRET: z.string().min(1, 'Slack client secret is required'),
  ANTHROPIC_API_KEY: z.string().min(1, 'Anthropic API key is required'),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-20250514'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RATE_LIMIT_PER_USER_PER_MINUTE: z.coerce.number().int().positive().default(5),
  APP_URL: z.string().url('APP_URL must be a valid URL'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate with: openssl rand -hex 32'),
});

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${errors}`);
  }

  return Object.freeze({
    slackBotToken: parsed.data.SLACK_BOT_TOKEN,
    slackAppToken: parsed.data.SLACK_APP_TOKEN,
    slackSigningSecret: parsed.data.SLACK_SIGNING_SECRET,
    slackClientId: parsed.data.SLACK_CLIENT_ID,
    slackClientSecret: parsed.data.SLACK_CLIENT_SECRET,
    anthropicApiKey: parsed.data.ANTHROPIC_API_KEY,
    claudeModel: parsed.data.CLAUDE_MODEL,
    logLevel: parsed.data.LOG_LEVEL,
    rateLimitPerUserPerMinute: parsed.data.RATE_LIMIT_PER_USER_PER_MINUTE,
    appUrl: parsed.data.APP_URL,
    port: parsed.data.PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    tokenEncryptionKey: parsed.data.TOKEN_ENCRYPTION_KEY,
  });
}
