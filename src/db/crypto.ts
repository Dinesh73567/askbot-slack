import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a colon-separated base64 string: `iv:ciphertext:tag`.
 *
 * @param plain   - The string to encrypt.
 * @param keyHex  - A 64-character hex string representing a 32-byte key.
 *                  Generate with: openssl rand -hex 32
 */
export function encrypt(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), encrypted.toString('base64'), tag.toString('base64')].join(':');
}

/**
 * Decrypt a blob produced by `encrypt`.
 * Throws if the GCM authentication tag is invalid (tampered ciphertext).
 *
 * @param blob    - The `iv:ciphertext:tag` base64 string.
 * @param keyHex  - Same 64-character hex key used for encryption.
 */
export function decrypt(blob: string, keyHex: string): string {
  const parts = blob.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted blob format');
  }
  const [ivB64, ciphertextB64, tagB64] = parts as [string, string, string];
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');

  if (tag.length !== TAG_BYTES) {
    throw new Error('Invalid auth tag length');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
