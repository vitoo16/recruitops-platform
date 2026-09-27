import { Injectable } from '@nestjs/common';
import { OAuthCredentialCipher, type OAuthCredentialPayload } from './oauth-credential-cipher.js';
import { SocialCredentialsRepository } from './social-credentials.repository.js';

@Injectable()
export class OAuthCredentialStore {
  constructor(
    private readonly repository: SocialCredentialsRepository,
    private readonly cipher: OAuthCredentialCipher,
  ) {}

  async save(socialAccountId: string, payload: OAuthCredentialPayload): Promise<void> {
    const platform = await this.repository.getSocialAccountPlatform(socialAccountId);
    const encrypted = this.cipher.encrypt(platform, payload);
    await this.repository.upsertForSocialAccount(socialAccountId, encrypted);
  }

  async load(socialAccountId: string): Promise<OAuthCredentialPayload | null> {
    const encrypted = await this.repository.findForSocialAccount(socialAccountId);
    return encrypted ? this.cipher.decrypt(encrypted) : null;
  }

  async clear(socialAccountId: string): Promise<void> {
    await this.repository.deleteForSocialAccount(socialAccountId);
  }
}
