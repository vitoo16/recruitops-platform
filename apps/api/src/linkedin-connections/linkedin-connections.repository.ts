import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { EncryptedOAuthCredential } from '../social-credentials/oauth-credential-cipher.js';

export interface LinkedInPromotionRecord {
  externalAccountId: string;
  displayName: string;
  scopes: readonly string[];
  expiresAt: string;
  credential: EncryptedOAuthCredential;
}

export interface PromotedLinkedInAccount {
  socialAccountId: string;
  destinationId: string;
  externalAccountId: string;
  displayName: string;
  expiresAt: string;
}

export interface LinkedInConnectedAccount {
  id: string;
  externalAccountId: string;
  displayName: string;
  status: 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';
  scopes: readonly string[];
  expiresAt: string | null;
}

function toDatabaseBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

function encryptedCredentialData(credential: EncryptedOAuthCredential) {
  return {
    platform: credential.platform,
    keyId: credential.keyId,
    algorithm: credential.algorithm,
    iv: toDatabaseBytes(credential.iv),
    authTag: toDatabaseBytes(credential.authTag),
    ciphertext: toDatabaseBytes(credential.ciphertext),
  };
}

@Injectable()
export class LinkedInConnectionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<readonly LinkedInConnectedAccount[]> {
    const accounts = await this.database.client.socialAccount.findMany({
      where: { platform: 'LINKEDIN' },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        externalAccountId: true,
        displayName: true,
        status: true,
        scopes: true,
        expiresAt: true,
      },
    });

    return accounts.map((account) => ({
      id: account.id,
      externalAccountId: account.externalAccountId,
      displayName: account.displayName,
      status: account.status,
      scopes: account.scopes,
      expiresAt: account.expiresAt?.toISOString() ?? null,
    }));
  }

  async promote(record: LinkedInPromotionRecord): Promise<PromotedLinkedInAccount> {
    if (record.credential.platform !== 'LINKEDIN') {
      throw new ConflictException({
        code: 'LINKEDIN_CREDENTIAL_PLATFORM_MISMATCH',
        message: 'LinkedIn credential platform does not match the selected account',
      });
    }

    return this.database.client.$transaction(async (transaction) => {
      const credentialData = encryptedCredentialData(record.credential);
      const expiresAt = new Date(record.expiresAt);
      const existingAccount = await transaction.socialAccount.findFirst({
        where: {
          platform: 'LINKEDIN',
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
            expiresAt,
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
            platform: 'LINKEDIN',
            externalAccountId: record.externalAccountId,
            displayName: record.displayName,
            status: 'CONNECTED',
            scopes: [...record.scopes],
            expiresAt,
            credentialRef: credential.id,
          },
          select: { id: true },
        });
        socialAccountId = account.id;
      }

      const existingDestination = await transaction.destination.findFirst({
        where: {
          socialAccountId,
          platform: 'LINKEDIN',
          externalId: record.externalAccountId,
        },
        select: { id: true },
      });

      let destinationId: string;
      if (existingDestination) {
        destinationId = existingDestination.id;
        await transaction.destination.update({
          where: { id: destinationId },
          data: {
            type: 'PROFILE',
            name: record.displayName,
            postingMode: 'API',
            enabled: true,
          },
        });
      } else {
        const destination = await transaction.destination.create({
          data: {
            platform: 'LINKEDIN',
            type: 'PROFILE',
            name: record.displayName,
            externalId: record.externalAccountId,
            postingMode: 'API',
            enabled: true,
            socialAccountId,
          },
          select: { id: true },
        });
        destinationId = destination.id;
      }

      return {
        socialAccountId,
        destinationId,
        externalAccountId: record.externalAccountId,
        displayName: record.displayName,
        expiresAt: record.expiresAt,
      };
    });
  }
}
