export class AskBotError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'AskBotError';
  }
}

export class SlackApiError extends AskBotError {
  constructor(message: string, retryable: boolean = false) {
    super(message, 'SLACK_API_ERROR', retryable);
    this.name = 'SlackApiError';
  }
}

export class AIError extends AskBotError {
  constructor(message: string, retryable: boolean = false) {
    super(message, 'AI_ERROR', retryable);
    this.name = 'AIError';
  }
}

export class ConfigError extends AskBotError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', false);
    this.name = 'ConfigError';
  }
}

export class RateLimitError extends AskBotError {
  constructor(userId: string) {
    super(
      `Rate limit exceeded for user ${userId}`,
      'RATE_LIMIT',
      true,
    );
    this.name = 'RateLimitError';
  }
}
