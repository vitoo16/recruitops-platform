import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { SocialPlatform } from '@recruitops/contracts';
import { DatabaseService } from '../database/database.service.js';
import type { EncryptedOAuthCredential } from './oauth-credential-cipher.js';

export interface StoredOAuthCredential extends EncryptedOAuthCredential {
  id: string;
}

function toDatabaseBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

@Injectable()
export class SocialCredentialsRepository {
  constructor(private readonly database: DatabaseService) {}

  async getSocialAccountPlatform(socialAccountId: string): Promise<SocialPlatform> {
    const account = await this.database.client.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: { platform: true },
    });
    if (!account) {
      throw new NotFoundException({
        code: 'SOCIAL_ACCOUNT_NOT_FOUND',
        message: 'Social account was not found',
      });
    }
    return account.platform;
  }

  async upsertForSocialAccount(
    socialAccountId: string,
    encrypted: EncryptedOAuthCredential,
  ): Promise<void> {
    await this.database.client.$transaction(async (transaction) => {
      const account = await transaction.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { platform: true, credentialRef: true },
      });
      if (!account) {
        throw new NotFoundException({
          code: 'SOCIAL_ACCOUNT_NOT_FOUND',
          message: 'Social account was not found',
        });
      }
      if (account.platform !== encrypted.platform) {
        throw new ConflictException({
          code: 'SOCIAL_CREDENTIAL_PLATFORM_MISMATCH',
          message: 'Credential platform does not match social account platform',
        });
      }

      const data = {
        platform: encrypted.platform,
        keyId: encrypted.keyId,
        algorithm: encrypted.algorithm,
        iv: toDatabaseBytes(encrypted.iv),
        authTag: toDatabaseBytes(encrypted.authTag),
        ciphertext: toDatabaseBytes(encrypted.ciphertext),
      };

      if (account.credentialRef) {
        const existing = await transaction.socialCredential.findUnique({
          where: { id: account.credentialRef },
          select: { id: true },
        });
        if (!existing) {
          throw new ConflictException({
            code: 'SOCIAL_CREDENTIAL_REFERENCE_INVALID',
            message: 'Social account credential reference is invalid',
          });
        }
        await transaction.socialCredential.update({
          where: { id: account.credentialRef },
          data,
        });
        return;
      }

      const credential = await transaction.socialCredential.create({ data });
      await transaction.socialAccount.update({
        where: { id: socialAccountId },
        data: { credentialRef: credential.id },
      });
    });
  }

  async findForSocialAccount(socialAccountId: string): Promise<StoredOAuthCredential | null> {
    const account = await this.database.client.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: {
        platform: true,
        credential: {
          select: {
            id: true,
            platform: true,
            keyId: true,
            algorithm: true,
            iv: true,
            authTag: true,
            ciphertext: true,
          },
        },
      },
    });
    if (!account) {
      throw new NotFoundException({
        code: 'SOCIAL_ACCOUNT_NOT_FOUND',
        message: 'Social account was not found',
      });
    }
    if (!account.credential) return null;
    if (account.credential.platform !== account.platform) {
      throw new ConflictException({
        code: 'SOCIAL_CREDENTIAL_PLATFORM_MISMATCH',
        message: 'Credential platform does not match social account platform',
      });
    }
    if (account.credential.algorithm !== 'aes-256-gcm') {
      throw new ConflictException({
        code: 'SOCIAL_CREDENTIAL_ALGORITHM_UNSUPPORTED',
        message: 'Stored credential uses an unsupported encryption algorithm',
      });
    }

    return {
      id: account.credential.id,
      platform: account.credential.platform,
      keyId: account.credential.keyId,
      algorithm: account.credential.algorithm,
      iv: account.credential.iv,
      authTag: account.credential.authTag,
      ciphertext: account.credential.ciphertext,
    };
  }

  async deleteForSocialAccount(socialAccountId: string): Promise<void> {
    await this.database.client.$transaction(async (transaction) => {
      const account = await transaction.socialAccount.findUnique({
        where: { id: socialAccountId },
        select: { credentialRef: true },
      });
      if (!account) {
        throw new NotFoundException({
          code: 'SOCIAL_ACCOUNT_NOT_FOUND',
          message: 'Social account was not found',
        });
      }
      if (!account.credentialRef) return;

      await transaction.socialAccount.update({
        where: { id: socialAccountId },
        data: { credentialRef: null },
      });
      await transaction.socialCredential.delete({ where: { id: account.credentialRef } });
    });
  }
}
