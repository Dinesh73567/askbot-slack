// ============================================
// AskBot Slack - Type Definitions
// ============================================

/** Envelope pattern for all async operations */
export interface Envelope<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: string | null;
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
  readonly slackSigningSecret: string;
  readonly slackClientId: string;
  readonly slackClientSecret: string;
  readonly anthropicApiKey: string;
  readonly claudeModel: string;
  readonly logLevel: string;
  readonly rateLimitPerUserPerMinute: number;
  readonly appUrl: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly tokenEncryptionKey: string;
}

/** Stored user OAuth token record */
export interface UserTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly token: string;
  readonly teamId: string;
  readonly scopes: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Query categories detected from user input */
export type QueryType =
  | 'personal'
  | 'channel'
  | 'mentions'
  | 'digest'
  | 'people';

/** Time window for message filtering */
export interface TimeWindow {
  readonly oldest: number; // Unix timestamp in seconds
  readonly latest: number; // Unix timestamp in seconds
}

/** Parsed and classified user query */
export interface ParsedQuery {
  readonly raw: string;
  readonly type: QueryType;
  readonly keywords: readonly string[];
  readonly channelName?: string;
  readonly personMention?: string;
  readonly timeWindow?: TimeWindow;
  readonly searchQuery: string; // Assembled Slack search query string
}

/** A raw search result from search.messages */
export interface SearchResult {
  readonly messageId: string;
  readonly text: string;
  readonly userId: string;
  readonly channelId: string;
  readonly channelName: string;
  readonly timestamp: string;
  readonly permalink: string;
  readonly reactionCount: number;
  readonly replyCount: number;
}
