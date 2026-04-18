import { Router } from 'express';
import { z } from 'zod';
import { WebClient } from '@slack/web-api';
import type { AppConfig } from '../types/index.js';
import type { Logger } from '../utils/logger.js';
import { buildAuthorizeUrl, getRedirectUri } from './oauth-config.js';
import { verifyState } from './oauth-state.js';
import { saveUserToken } from '../db/token-store.js';

/** Escape HTML special characters to prevent XSS in HTML responses */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Zod schemas for OAuth query parameter validation */
const installQuerySchema = z.object({
  user_id: z.string().min(1, 'user_id is required'),
});

const callbackQuerySchema = z.object({
  code: z.string().min(1, 'code is required'),
  state: z.string().min(1, 'state is required'),
});

const oauthAccessResponseSchema = z.object({
  ok: z.literal(true),
  authed_user: z.object({
    id: z.string(),
    access_token: z.string(),
    scope: z.string().optional().default(''),
  }),
  team: z.object({
    id: z.string(),
  }),
});

/** Security headers applied to all OAuth HTML responses */
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>AskBot Connected</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px">
<h1>Connected!</h1>
<p>Your Slack account is now linked to AskBot. Go back to Slack and ask me anything.</p>
</body>
</html>`;

const ERROR_HTML = (message: string) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>AskBot Error</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px">
<h1>Connection Failed</h1>
<p>${escapeHtml(message)}</p>
</body>
</html>`;

export function createOAuthRouter(config: AppConfig, logger: Logger): Router {
  const router = Router();

  /**
   * GET /auth/install?user_id=<slackUserId>
   * Redirects the user to Slack's OAuth authorization page.
   */
  router.get('/install', (req, res) => {
    const parsed = installQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join(', ');
      logger.warn({ query: req.query }, 'Invalid install query params');
      res.set(SECURITY_HEADERS).status(400).send(ERROR_HTML(`Invalid request: ${message}`));
      return;
    }

    const authorizeUrl = buildAuthorizeUrl(config, parsed.data.user_id);
    logger.info({ userId: parsed.data.user_id }, 'Redirecting user to Slack OAuth');
    res.redirect(302, authorizeUrl);
  });

  /**
   * GET /auth/callback?code=<oauthCode>&state=<signedState>
   * Verifies the signed state, exchanges the OAuth code for a user token, and stores it.
   */
  router.get('/callback', async (req, res) => {
    const parsed = callbackQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => i.message).join(', ');
      logger.warn({ query: req.query }, 'Invalid callback query params');
      res.set(SECURITY_HEADERS).status(400).send(ERROR_HTML(`Invalid request: ${message}`));
      return;
    }

    const { code, state } = parsed.data;

    // Verify signed state — recover userId from payload, never trust raw query param
    let userId: string;
    try {
      userId = verifyState(state, config.slackSigningSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'State verification failed';
      logger.warn({ error: message }, 'OAuth state verification failed');
      res.set(SECURITY_HEADERS).status(400).send(ERROR_HTML('Invalid or expired authorization request. Please try again.'));
      return;
    }

    const redirectUri = getRedirectUri(config.appUrl);

    try {
      // Exchange code for token using the Slack Web API client
      const slackClient = new WebClient();
      const response = await slackClient.oauth.v2.access({
        client_id: config.slackClientId,
        client_secret: config.slackClientSecret,
        code,
        redirect_uri: redirectUri,
      });

      // Validate the response shape
      const accessParsed = oauthAccessResponseSchema.safeParse(response);
      if (!accessParsed.success) {
        logger.error({ userId, issues: accessParsed.error.issues }, 'Unexpected OAuth response shape');
        res.set(SECURITY_HEADERS).status(500).send(ERROR_HTML('Unexpected response from Slack. Please try again.'));
        return;
      }

      const { authed_user, team } = accessParsed.data;

      // Save the token — never log the token value itself
      const saveResult = await saveUserToken(
        userId,
        authed_user.access_token,
        team.id,
        authed_user.scope,
      );

      if (!saveResult.success) {
        logger.error({ userId, error: saveResult.error }, 'Failed to save user token');
        res.set(SECURITY_HEADERS).status(500).send(ERROR_HTML('Failed to save your token. Please try again.'));
        return;
      }

      logger.info({ userId, teamId: team.id }, 'User token saved successfully');
      res.set(SECURITY_HEADERS).status(200).send(SUCCESS_HTML);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ userId, error: message }, 'OAuth callback failed');
      res.set(SECURITY_HEADERS).status(500).send(ERROR_HTML('Authentication failed. Please try again.'));
    }
  });

  return router;
}
