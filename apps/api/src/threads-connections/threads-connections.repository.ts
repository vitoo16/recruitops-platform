import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { EncryptedOAuthCredential } from '../social-credentials/oauth-credential-cipher.js';

export interface ThreadsPromotionRecord {
  externalAccountId: string;
  displayName: string;
  scopes: readonly string[];
  expiresAt: string | null;
  credential: EncryptedOAuthCredential;
}

export interface PromotedThreadsAccount {
  socialAccountId: string;
  destinationId: string;
  externalAccountId: string;
  displayName: string;
  expiresAt: string | null;
}

export interface ThreadsConnectedAccount {
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

@Injectable()
export class ThreadsConnectionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<readonly ThreadsConnectedAccount[]> {
    const accounts = await this.database.client.socialAccount.findMany({
      where: { platform: 'THREADS' },
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

  async promote(record: ThreadsPromotionRecord): Promise<PromotedThreadsAccount> {
    if (record.credential.platform !== 'THREADS') {
      throw new ConflictException({
        code: 'THREADS_CREDENTIAL_PLATFORM_MISMATCH',
        message: 'Threads credential platform does not match the selected account',
      });
    }

    return this.database.client.$transaction(async (transaction) => {
      const credentialData = {
        platform: record.credential.platform,
        keyId: record.credential.keyId,
        algorithm: record.credential.algorithm,
        iv: toDatabaseBytes(record.credential.iv),
        authTag: toDatabaseBytes(record.credential.authTag),
        ciphertext: toDatabaseBytes(record.credential.ciphertext),
      };
      const expiresAt = record.expiresAt ? new Date(record.expiresAt) : null;

      const existingAccount = await transaction.socialAccount.findFirst({
        where: {
          platform: 'THREADS',
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
            platform: 'THREADS',
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
          platform: 'THREADS',
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
            platform: 'THREADS',
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
