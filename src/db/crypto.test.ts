import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto.js';

// 64-char hex = 32 bytes
const TEST_KEY = 'a'.repeat(64);

describe('encrypt / decrypt', () => {
  it('round-trips a simple string', () => {
    const blob = encrypt('hello world', TEST_KEY);
    expect(decrypt(blob, TEST_KEY)).toBe('hello world');
  });

  it('round-trips an empty string', () => {
    const blob = encrypt('', TEST_KEY);
    expect(decrypt(blob, TEST_KEY)).toBe('');
  });

  it('round-trips a token-like string', () => {
    const token = 'xoxp-12345-67890-abcdef-long-slack-token-value';
    expect(decrypt(encrypt(token, TEST_KEY), TEST_KEY)).toBe(token);
  });

  it('produces different ciphertexts for same input (random IV)', () => {
    const b1 = encrypt('same', TEST_KEY);
    const b2 = encrypt('same', TEST_KEY);
    expect(b1).not.toBe(b2);
  });

  it('throws on GCM tag mismatch (tampered ciphertext)', () => {
    const blob = encrypt('secret', TEST_KEY);
    const parts = blob.split(':');
    // Corrupt a byte of the ciphertext
    const corruptedCipher = Buffer.from(parts[1]!, 'base64');
    corruptedCipher[0] = corruptedCipher[0]! ^ 0xff;
    parts[1] = corruptedCipher.toString('base64');
    expect(() => decrypt(parts.join(':'), TEST_KEY)).toThrow();
  });

  it('throws on wrong key', () => {
    const blob = encrypt('secret', TEST_KEY);
    const wrongKey = 'b'.repeat(64);
    expect(() => decrypt(blob, wrongKey)).toThrow();
  });

  it('throws on malformed blob (wrong number of parts)', () => {
    expect(() => decrypt('only-one-part', TEST_KEY)).toThrow('Invalid encrypted blob format');
  });
});
