import { describe, expect, it, vi } from 'vitest';
import { OAuthCredentialStore } from './oauth-credential-store.js';
import type { OAuthCredentialCipher } from './oauth-credential-cipher.js';
import type { SocialCredentialsRepository } from './social-credentials.repository.js';

const encrypted = {
  id: 'credential-id',
  platform: 'FACEBOOK' as const,
  keyId: 'v1',
  algorithm: 'aes-256-gcm' as const,
  iv: Uint8Array.from([1]),
  authTag: Uint8Array.from([2]),
  ciphertext: Uint8Array.from([3]),
};

describe('OAuthCredentialStore', () => {
  it('encrypts before persistence and never passes plaintext to the repository', async () => {
    const repository = {
      getSocialAccountPlatform: vi.fn().mockResolvedValue('FACEBOOK'),
      upsertForSocialAccount: vi.fn().mockResolvedValue(undefined),
    };
    const cipher = {
      encrypt: vi.fn().mockReturnValue(encrypted),
    };
    const store = new OAuthCredentialStore(
      repository as unknown as SocialCredentialsRepository,
      cipher as unknown as OAuthCredentialCipher,
    );
    const payload = { accessToken: 'secret-access-token', scopes: [] };

    await store.save('account-id', payload);

    expect(cipher.encrypt).toHaveBeenCalledWith('FACEBOOK', payload);
    expect(repository.upsertForSocialAccount).toHaveBeenCalledWith('account-id', encrypted);
    expect(JSON.stringify(repository.upsertForSocialAccount.mock.calls)).not.toContain(
      'secret-access-token',
    );
  });

  it('decrypts only after loading the encrypted record', async () => {
    const repository = {
      findForSocialAccount: vi.fn().mockResolvedValue(encrypted),
    };
    const cipher = {
      decrypt: vi.fn().mockReturnValue({ accessToken: 'secret', scopes: [] }),
    };
    const store = new OAuthCredentialStore(
      repository as unknown as SocialCredentialsRepository,
      cipher as unknown as OAuthCredentialCipher,
    );

    await expect(store.load('account-id')).resolves.toEqual({ accessToken: 'secret', scopes: [] });
    expect(cipher.decrypt).toHaveBeenCalledWith(encrypted);
  });

  it('returns null when no credential is connected', async () => {
    const repository = {
      findForSocialAccount: vi.fn().mockResolvedValue(null),
    };
    const cipher = { decrypt: vi.fn() };
    const store = new OAuthCredentialStore(
      repository as unknown as SocialCredentialsRepository,
      cipher as unknown as OAuthCredentialCipher,
    );

    await expect(store.load('account-id')).resolves.toBeNull();
    expect(cipher.decrypt).not.toHaveBeenCalled();
  });
});
