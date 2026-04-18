import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildState, verifyState } from './oauth-state.js';

const SECRET = 'test-signing-secret-abc123';
const USER_ID = 'U12345';

describe('buildState / verifyState round-trip', () => {
  it('returns the original userId on valid state', () => {
    const state = buildState(USER_ID, SECRET);
    expect(verifyState(state, SECRET)).toBe(USER_ID);
  });

  it('throws on tampered signature', () => {
    const state = buildState(USER_ID, SECRET);
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    decoded.sig = 'a'.repeat(decoded.sig.length);
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    expect(() => verifyState(tampered, SECRET)).toThrow('signature mismatch');
  });

  it('throws on wrong secret', () => {
    const state = buildState(USER_ID, SECRET);
    expect(() => verifyState(state, 'wrong-secret')).toThrow();
  });

  it('throws on expired timestamp', () => {
    // Build state, then advance time 11 minutes
    const state = buildState(USER_ID, SECRET);
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now + 11 * 60 * 1000);
    expect(() => verifyState(state, SECRET)).toThrow('expired');
    vi.useRealTimers();
  });

  it('throws on malformed base64', () => {
    expect(() => verifyState('!!!not-base64!!!', SECRET)).toThrow('Malformed');
  });

  it('throws on invalid JSON after base64 decode', () => {
    const bad = Buffer.from('not json at all').toString('base64url');
    expect(() => verifyState(bad, SECRET)).toThrow('Malformed');
  });

  it('throws on missing required fields', () => {
    const bad = Buffer.from(JSON.stringify({ userId: USER_ID })).toString('base64url');
    expect(() => verifyState(bad, SECRET)).toThrow('missing required fields');
  });

  it('produces different states for same userId (nonce randomness)', () => {
    const s1 = buildState(USER_ID, SECRET);
    const s2 = buildState(USER_ID, SECRET);
    expect(s1).not.toBe(s2);
  });
});
