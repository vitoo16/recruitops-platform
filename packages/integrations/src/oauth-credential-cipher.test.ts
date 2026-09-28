import { describe, expect, it } from 'vitest';
import { OAuthCredentialCipher, parseOAuthCredentialKeyring } from './oauth-credential-cipher.js';

const key = Buffer.alloc(32, 7).toString('base64');
const env = {
  OAUTH_CREDENTIAL_ACTIVE_KEY_ID: 'primary',
  OAUTH_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ primary: key }),
} as NodeJS.ProcessEnv;

describe('OAuthCredentialCipher', () => {
  it('round-trips credentials with the configured keyring', () => {
    const cipher = new OAuthCredentialCipher();
    const encrypted = cipher.encrypt(
      'FACEBOOK',
      {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        scopes: ['pages_show_list', 'pages_show_list'],
      },
      env,
    );

    expect(encrypted.keyId).toBe('primary');
    expect(cipher.decrypt(encrypted, env)).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      scopes: ['pages_show_list'],
    });
  });

  it('binds ciphertext to platform through authenticated data', () => {
    const cipher = new OAuthCredentialCipher();
    const encrypted = cipher.encrypt('FACEBOOK', { accessToken: 'access-token', scopes: [] }, env);

    expect(() => cipher.decrypt({ ...encrypted, platform: 'INSTAGRAM' }, env)).toThrow(
      'OAUTH_CREDENTIAL_DECRYPTION_FAILED',
    );
  });

  it('fails closed when the active key is not present', () => {
    expect(() =>
      parseOAuthCredentialKeyring({
        OAUTH_CREDENTIAL_ACTIVE_KEY_ID: 'missing',
        OAUTH_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ primary: key }),
      } as NodeJS.ProcessEnv),
    ).toThrow('OAUTH_CREDENTIAL_ACTIVE_KEY_NOT_FOUND');
  });
});
