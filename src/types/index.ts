// ============================================
// AskBot Slack - Type Definitions
// ============================================

/** Envelope pattern for all async operations */
export interface Envelope<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: string | null;
}

/** A Slack message retrieved from a channel */
export interface SlackMessage {
  readonly text: string;
  readonly userId: string;
  readonly username: string;
  readonly channelId: string;
  readonly channelName: string;
  readonly timestamp: string;
  readonly threadTs?: string;
  readonly permalink?: string;
}

/** A ranked search result ready for the AI prompt */
export interface RankedResult extends SlackMessage {
  readonly rank: number;
  readonly relevanceScore: number;
}

/** Results grouped by channel for prompt building */
export interface GroupedResults {
  readonly channelName: string;
  readonly channelId: string;
  readonly messages: readonly RankedResult[];
}

/** AI-generated summary response */
export interface AISummary {
  readonly answer: string;
  readonly channelsCited: readonly string[];
  readonly messageCount: number;
  readonly model: string;
}

/** Validated environment configuration */
export interface AppConfig {
  readonly slackBotToken: string;
  readonly slackAppToken: string;
  readonly slackSigningSecret: string;
  readonly anthropicApiKey: string;
  readonly claudeModel: string;
  readonly logLevel: string;
  readonly rateLimitPerUserPerMinute: number;
}
