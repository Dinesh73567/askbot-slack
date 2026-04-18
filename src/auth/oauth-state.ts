import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Maximum age of a state token in milliseconds (10 minutes) */
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** Opaque payload encoded in the state parameter */
interface StatePayload {
  readonly userId: string;
  readonly nonce: string;
  readonly ts: number;
  readonly sig: string;
}

function computeSig(secret: string, userId: string, nonce: string, ts: number): string {
  return createHmac('sha256', secret)
    .update(`${userId}:${nonce}:${ts}`)
    .digest('hex');
}

/**
 * Build a signed, base64url-encoded state string.
 * Encodes userId + nonce + timestamp + HMAC-SHA256 signature.
 */
export function buildState(userId: string, secret: string): string {
  const nonce = randomBytes(16).toString('hex');
  const ts = Date.now();
  const sig = computeSig(secret, userId, nonce, ts);
  const payload: StatePayload = { userId, nonce, ts, sig };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Verify a signed state string and return the embedded userId.
 * Throws a descriptive error when verification fails.
 */
export function verifyState(state: string, secret: string): string {
  let payload: StatePayload;
  try {
    const json = Buffer.from(state, 'base64url').toString('utf8');
    payload = JSON.parse(json) as StatePayload;
  } catch {
    throw new Error('Malformed OAuth state: invalid base64url or JSON');
  }

  const { userId, nonce, ts, sig } = payload;
  if (!userId || !nonce || typeof ts !== 'number' || !sig) {
    throw new Error('Malformed OAuth state: missing required fields');
  }

  // Timing-safe signature comparison
  const expected = computeSig(secret, userId, nonce, ts);
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(sig, 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new Error('OAuth state signature mismatch');
  }

  // Timestamp freshness check
  if (Date.now() - ts > STATE_MAX_AGE_MS) {
    throw new Error('OAuth state expired (older than 10 minutes)');
  }

  return userId;
}
