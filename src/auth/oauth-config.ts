import type { AppConfig } from '../types/index.js';
import { buildState } from './oauth-state.js';

/** The Slack OAuth v2 authorization endpoint */
const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';

/** The single redirect URI used for both install and callback.
 *  Keeping it in one place ensures byte-exact matching between
 *  the authorize redirect and the token exchange call. */
export function getRedirectUri(appUrl: string): string {
  return `${appUrl}/auth/callback`;
}

/**
 * Build the Slack OAuth v2 authorization URL.
 * Uses user_scope (not scope) because we need a user token (xoxp-).
 * The state parameter is HMAC-SHA256 signed to prevent CSRF.
 */
export function buildAuthorizeUrl(config: AppConfig, userId: string): string {
  const state = buildState(userId, config.slackSigningSecret);
  const params = new URLSearchParams({
    client_id: config.slackClientId,
    user_scope: 'search:read,chat:write',
    redirect_uri: getRedirectUri(config.appUrl),
    state,
  });
  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
}
