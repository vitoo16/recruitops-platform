import { ConflictException, Injectable } from '@nestjs/common';
import type { SocialPlatform } from '@recruitops/contracts';
import { DatabaseService } from '../database/database.service.js';
import type { EncryptedOAuthCredential } from '../social-credentials/oauth-credential-cipher.js';

export interface MetaPromotionRecord {
  platform: Extract<SocialPlatform, 'FACEBOOK' | 'INSTAGRAM'>;
  externalAccountId: string;
  displayName: string;
  scopes: readonly string[];
  credential: EncryptedOAuthCredential;
  destinationType: 'PAGE' | 'PROFILE';
  destinationName: string;
  destinationExternalId: string;
}

export interface PromotedMetaAccount {
  socialAccountId: string;
  destinationId: string;
  platform: Extract<SocialPlatform, 'FACEBOOK' | 'INSTAGRAM'>;
  externalAccountId: string;
  displayName: string;
}

function toDatabaseBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

@Injectable()
export class MetaConnectionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async promote(records: readonly MetaPromotionRecord[]): Promise<readonly PromotedMetaAccount[]> {
    for (const record of records) {
      if (record.credential.platform !== record.platform) {
        throw new ConflictException({
          code: 'META_CREDENTIAL_PLATFORM_MISMATCH',
          message: 'Meta credential platform does not match selected account platform',
        });
      }
    }

    return this.database.client.$transaction(async (transaction) => {
      const promoted: PromotedMetaAccount[] = [];

      for (const record of records) {
        const credentialData = {
          platform: record.credential.platform,
          keyId: record.credential.keyId,
          algorithm: record.credential.algorithm,
          iv: toDatabaseBytes(record.credential.iv),
          authTag: toDatabaseBytes(record.credential.authTag),
          ciphertext: toDatabaseBytes(record.credential.ciphertext),
        };

        const existingAccount = await transaction.socialAccount.findFirst({
          where: {
            platform: record.platform,
            externalAccountId: record.externalAccountId,
          },
          select: { id: true, credentialRef: true },
        });

        let socialAccountId: string;
        if (existingAccount) {
          socialAccountId = existingAccount.id;
          await transaction.socialAccount.update({
            where: { id: socialAccountId },
            data: {
              displayName: record.displayName,
              status: 'CONNECTED',
              scopes: [...record.scopes],
              expiresAt: null,
            },
          });

          if (existingAccount.credentialRef) {
            await transaction.socialCredential.update({
              where: { id: existingAccount.credentialRef },
              data: credentialData,
            });
          } else {
            const credential = await transaction.socialCredential.create({ data: credentialData });
            await transaction.socialAccount.update({
              where: { id: socialAccountId },
              data: { credentialRef: credential.id },
            });
          }
        } else {
          const credential = await transaction.socialCredential.create({ data: credentialData });
          const account = await transaction.socialAccount.create({
            data: {
              platform: record.platform,
              externalAccountId: record.externalAccountId,
              displayName: record.displayName,
              status: 'CONNECTED',
              scopes: [...record.scopes],
              credentialRef: credential.id,
            },
            select: { id: true },
          });
          socialAccountId = account.id;
        }

        const existingDestination = await transaction.destination.findFirst({
          where: {
            socialAccountId,
            platform: record.platform,
            externalId: record.destinationExternalId,
          },
          select: { id: true },
        });

        let destinationId: string;
        if (existingDestination) {
          destinationId = existingDestination.id;
          await transaction.destination.update({
            where: { id: destinationId },
            data: {
              type: record.destinationType,
              name: record.destinationName,
              postingMode: 'API',
              enabled: true,
            },
          });
        } else {
          const destination = await transaction.destination.create({
            data: {
              platform: record.platform,
              type: record.destinationType,
              name: record.destinationName,
              externalId: record.destinationExternalId,
              postingMode: 'API',
              enabled: true,
              socialAccountId,
            },
            select: { id: true },
          });
          destinationId = destination.id;
        }

        promoted.push({
          socialAccountId,
          destinationId,
          platform: record.platform,
          externalAccountId: record.externalAccountId,
          displayName: record.displayName,
        });
      }

      return promoted;
    });
  }
}
