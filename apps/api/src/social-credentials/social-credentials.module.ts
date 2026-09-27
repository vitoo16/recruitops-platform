import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { OAuthCredentialCipher } from './oauth-credential-cipher.js';
import { OAuthCredentialStore } from './oauth-credential-store.js';
import { SocialCredentialsRepository } from './social-credentials.repository.js';

@Module({
  imports: [DatabaseModule],
  providers: [OAuthCredentialCipher, OAuthCredentialStore, SocialCredentialsRepository],
  exports: [OAuthCredentialStore],
})
export class SocialCredentialsModule {}
