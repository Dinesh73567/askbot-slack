import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { AppConfig } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

// Mock dependencies
vi.mock('../db/token-store.js', () => ({
  saveUserToken: vi.fn(),
}));

vi.mock('@slack/web-api', () => {
  const mockAccess = vi.fn();
  const MockWebClient = vi.fn().mockImplementation(() => ({
    oauth: { v2: { access: mockAccess } },
  }));
  return { WebClient: MockWebClient };
});

import { createOAuthRouter } from './oauth-routes.js';
import { saveUserToken } from '../db/token-store.js';
import { WebClient } from '@slack/web-api';
import { buildState } from './oauth-state.js';

const testConfig: AppConfig = {
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

function buildTestApp() {
  const app = express();
  const logger = createLogger('error');
  const router = createOAuthRouter(testConfig, logger);
  app.use('/auth', router);
  return app;
}

describe('GET /auth/install', () => {
  it('redirects to Slack OAuth URL with correct params and signed state', async () => {
    const app = buildTestApp();
    const response = await request(app).get('/auth/install?user_id=U12345');
    expect(response.status).toBe(302);
    const location = response.headers.location as string;
    expect(location).toContain('slack.com/oauth/v2/authorize');
    expect(location).toContain('client_id=client123');
    expect(location).toContain('user_scope=search%3Aread');
    // State is a signed blob, not the raw userId
    const stateParam = new URL(location).searchParams.get('state');
    expect(stateParam).toBeTruthy();
    expect(stateParam).not.toBe('U12345');
    const payload = JSON.parse(Buffer.from(stateParam!, 'base64url').toString());
    expect(payload.userId).toBe('U12345');
  });

  it('returns 400 when user_id is missing', async () => {
    const app = buildTestApp();
    const response = await request(app).get('/auth/install');
    expect(response.status).toBe(400);
    expect(response.text).toContain('Invalid request');
  });

  it('returns 400 when user_id is empty', async () => {
    const app = buildTestApp();
    const response = await request(app).get('/auth/install?user_id=');
    expect(response.status).toBe(400);
  });
});

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exchanges code and saves token on success', async () => {
    const mockInstance = new (WebClient as ReturnType<typeof vi.fn>)();
    mockInstance.oauth.v2.access.mockResolvedValue({
      ok: true,
      authed_user: { id: 'U12345', access_token: 'xoxp-token', scope: 'search:read' },
      team: { id: 'T12345' },
    });
    (saveUserToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: null, error: null });

    const state = buildState('U12345', testConfig.slackSigningSecret);
    const app = buildTestApp();
    const response = await request(app).get(`/auth/callback?code=abc123&state=${encodeURIComponent(state)}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain('Connected');
  });

  it('rejects callback with tampered state', async () => {
    const app = buildTestApp();
    // Raw userId instead of signed state — classic CSRF attempt
    const response = await request(app).get('/auth/callback?code=abc123&state=U12345');
    expect(response.status).toBe(400);
    expect(response.text).toContain('Connection Failed');
  });

  it('returns 400 when code is missing', async () => {
    const app = buildTestApp();
    const response = await request(app).get('/auth/callback?state=U12345');
    expect(response.status).toBe(400);
    expect(response.text).toContain('Invalid request');
  });

  it('returns 400 when state is missing', async () => {
    const app = buildTestApp();
    const response = await request(app).get('/auth/callback?code=abc123');
    expect(response.status).toBe(400);
    expect(response.text).toContain('Invalid request');
  });

  it('returns 500 when Slack OAuth fails', async () => {
    const mockInstance = new (WebClient as ReturnType<typeof vi.fn>)();
    mockInstance.oauth.v2.access.mockRejectedValue(new Error('invalid_code'));

    const state = buildState('U12345', testConfig.slackSigningSecret);
    const app = buildTestApp();
    const response = await request(app).get(`/auth/callback?code=bad-code&state=${encodeURIComponent(state)}`);
    expect(response.status).toBe(500);
    expect(response.text).toContain('Authentication failed');
  });

  it('returns 500 when saving token fails', async () => {
    const mockInstance = new (WebClient as ReturnType<typeof vi.fn>)();
    mockInstance.oauth.v2.access.mockResolvedValue({
      ok: true,
      authed_user: { id: 'U12345', access_token: 'xoxp-token', scope: 'search:read' },
      team: { id: 'T12345' },
    });
    (saveUserToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, data: null, error: 'DB error' });

    const state = buildState('U12345', testConfig.slackSigningSecret);
    const app = buildTestApp();
    const response = await request(app).get(`/auth/callback?code=abc123&state=${encodeURIComponent(state)}`);
    expect(response.status).toBe(500);
    expect(response.text).toContain('Failed to save');
  });
});
