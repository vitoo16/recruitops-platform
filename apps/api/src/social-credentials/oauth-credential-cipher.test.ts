import { describe, expect, it } from 'vitest';
import { OAuthCredentialCipher, parseOAuthCredentialKeyring } from './oauth-credential-cipher.js';

const keyV1 = Buffer.alloc(32, 7).toString('base64');
const keyV2 = Buffer.alloc(32, 9).toString('base64');

function environment(activeKeyId = 'v1', keys: Record<string, string> = { v1: keyV1 }) {
  return {
    OAUTH_CREDENTIAL_ACTIVE_KEY_ID: activeKeyId,
    OAUTH_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify(keys),
  } as NodeJS.ProcessEnv;
}

describe('OAuthCredentialCipher', () => {
  it('encrypts and decrypts a validated credential payload without plaintext persistence', () => {
    const cipher = new OAuthCredentialCipher();
    const payload = {
      accessToken: 'access-token-secret',
      refreshToken: 'refresh-token-secret',
      tokenType: 'Bearer',
      scopes: ['pages_read_engagement', 'pages_read_engagement'],
      expiresAt: '2026-09-28T12:00:00+00:00',
    };

    const encrypted = cipher.encrypt('FACEBOOK', payload, environment());
    expect(encrypted.keyId).toBe('v1');
    expect(encrypted.algorithm).toBe('aes-256-gcm');
    expect(encrypted.iv).toHaveLength(12);
    expect(encrypted.authTag).toHaveLength(16);
    expect(Buffer.from(encrypted.ciphertext).toString('utf8')).not.toContain('access-token-secret');

    expect(cipher.decrypt(encrypted, environment())).toEqual({
      ...payload,
      scopes: ['pages_read_engagement'],
    });
  });

  it('uses a fresh nonce for each encryption', () => {
    const cipher = new OAuthCredentialCipher();
    const payload = { accessToken: 'same-token', scopes: [] };

    const first = cipher.encrypt('LINKEDIN', payload, environment());
    const second = cipher.encrypt('LINKEDIN', payload, environment());

    expect(Buffer.from(first.iv).equals(Buffer.from(second.iv))).toBe(false);
    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
  });

  it('rejects tampered ciphertext and a wrong decryption key without leaking crypto details', () => {
    const cipher = new OAuthCredentialCipher();
    const encrypted = cipher.encrypt(
      'TIKTOK',
      { accessToken: 'secret', scopes: [] },
      environment(),
    );
    const tampered = {
      ...encrypted,
      ciphertext: Uint8Array.from(encrypted.ciphertext),
    };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 1;

    expect(() => cipher.decrypt(tampered, environment())).toThrow(
      'OAUTH_CREDENTIAL_DECRYPTION_FAILED',
    );
    expect(() => cipher.decrypt(encrypted, environment('v1', { v1: keyV2 }))).toThrow(
      'OAUTH_CREDENTIAL_DECRYPTION_FAILED',
    );
  });

  it('retains old keys for decryption during key rotation', () => {
    const cipher = new OAuthCredentialCipher();
    const encrypted = cipher.encrypt('ZALO', { accessToken: 'secret', scopes: [] }, environment());
    const rotated = environment('v2', { v1: keyV1, v2: keyV2 });

    expect(cipher.decrypt(encrypted, rotated).accessToken).toBe('secret');
    expect(cipher.encrypt('ZALO', { accessToken: 'new-secret', scopes: [] }, rotated).keyId).toBe(
      'v2',
    );
  });

  it('fails closed for invalid keyring configuration', () => {
    expect(() => parseOAuthCredentialKeyring({})).toThrow(
      'OAUTH_CREDENTIAL_ENCRYPTION_NOT_CONFIGURED',
    );
    expect(() =>
      parseOAuthCredentialKeyring(environment('v1', { v1: Buffer.alloc(16).toString('base64') })),
    ).toThrow('OAUTH_CREDENTIAL_ENCRYPTION_KEY_INVALID');
    expect(() => parseOAuthCredentialKeyring(environment('v2', { v1: keyV1 }))).toThrow(
      'OAUTH_CREDENTIAL_ACTIVE_KEY_NOT_FOUND',
    );
  });
});
