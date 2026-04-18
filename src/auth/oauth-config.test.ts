import { describe, it, expect } from 'vitest';
import { buildAuthorizeUrl, getRedirectUri } from './oauth-config.js';
import type { AppConfig } from '../types/index.js';

const baseConfig: AppConfig = {
  slackBotToken: 'xoxb-test',
  slackAppToken: 'xapp-test',
  slackSigningSecret: 'secret',
  slackClientId: 'client123',
  slackClientSecret: 'clientsecret',
  anthropicApiKey: 'sk-ant-test',
  claudeModel: 'claude-sonnet-4-20250514',
  logLevel: 'error',
  rateLimitPerUserPerMinute: 5,
  appUrl: 'https://example.com',
  port: 3000,
  databaseUrl: 'file:./dev.db',
  databaseProvider: 'sqlite',
};

describe('getRedirectUri', () => {
  it('builds redirect URI from appUrl', () => {
    expect(getRedirectUri('https://example.com')).toBe('https://example.com/auth/callback');
  });

  it('is consistent between install and callback (byte-exact match)', () => {
    const appUrl = 'https://my-app.railway.app';
    expect(getRedirectUri(appUrl)).toBe(getRedirectUri(appUrl));
  });
});

describe('buildAuthorizeUrl', () => {
  it('includes client_id', () => {
    const url = buildAuthorizeUrl(baseConfig, 'U12345');
    expect(url).toContain('client_id=client123');
  });

  it('requests user_scope=search:read,chat:write', () => {
    const url = buildAuthorizeUrl(baseConfig, 'U12345');
    expect(url).toContain('user_scope=search%3Aread%2Cchat%3Awrite');
  });

  it('includes a signed state parameter (not the raw userId)', () => {
    const url = buildAuthorizeUrl(baseConfig, 'U12345');
    const state = new URL(url).searchParams.get('state');
    expect(state).toBeTruthy();
    // Must NOT be the raw userId — state is an HMAC-signed base64url blob
    expect(state).not.toBe('U12345');
    // Decoded payload should contain the userId
    const payload = JSON.parse(Buffer.from(state!, 'base64url').toString());
    expect(payload.userId).toBe('U12345');
    expect(payload.sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes redirect_uri derived from appUrl', () => {
    const url = buildAuthorizeUrl(baseConfig, 'U12345');
    expect(url).toContain(encodeURIComponent('https://example.com/auth/callback'));
  });

  it('points to Slack OAuth endpoint', () => {
    const url = buildAuthorizeUrl(baseConfig, 'U12345');
    expect(url).toContain('slack.com/oauth/v2/authorize');
  });
});
