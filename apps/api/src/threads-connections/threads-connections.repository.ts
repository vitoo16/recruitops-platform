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

export interface ThreadsRefreshTarget {
  id: string;
  externalAccountId: string;
  displayName: string;
  status: 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';
  scopes: readonly string[];
  expiresAt: Date | null;
  credentialRef: string | null;
  credentialUpdatedAt: Date | null;
  credential: EncryptedOAuthCredential | null;
}

export interface ThreadsRefreshedCredentialRecord {
  accountId: string;
  credentialRef: string;
  expectedCredentialUpdatedAt: Date;
  displayName: string;
  expiresAt: string;
  credential: EncryptedOAuthCredential;
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

  async findRefreshTarget(accountId: string): Promise<ThreadsRefreshTarget | null> {
    const account = await this.database.client.socialAccount.findFirst({
      where: { id: accountId, platform: 'THREADS' },
      select: {
        id: true,
        externalAccountId: true,
        displayName: true,
        status: true,
        scopes: true,
        expiresAt: true,
        credentialRef: true,
        credential: {
          select: {
            platform: true,
            keyId: true,
            algorithm: true,
            iv: true,
            authTag: true,
            ciphertext: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!account) return null;

    const credential = account.credential;
    if (
      credential &&
      (credential.platform !== 'THREADS' || credential.algorithm !== 'aes-256-gcm')
    ) {
      throw new ConflictException({
        code: 'THREADS_CREDENTIAL_ENVELOPE_INVALID',
        message: 'Stored Threads credential envelope is invalid',
      });
    }

    return {
      id: account.id,
      externalAccountId: account.externalAccountId,
      displayName: account.displayName,
      status: account.status,
      scopes: account.scopes,
      expiresAt: account.expiresAt,
      credentialRef: account.credentialRef,
      credentialUpdatedAt: credential?.updatedAt ?? null,
      credential: credential
        ? {
            platform: 'THREADS',
            keyId: credential.keyId,
            algorithm: 'aes-256-gcm',
            iv: credential.iv,
            authTag: credential.authTag,
            ciphertext: credential.ciphertext,
          }
        : null,
    };
  }

  async persistRefresh(record: ThreadsRefreshedCredentialRecord): Promise<void> {
    if (record.credential.platform !== 'THREADS') {
      throw new ConflictException({
        code: 'THREADS_CREDENTIAL_PLATFORM_MISMATCH',
        message: 'Threads credential platform does not match the selected account',
      });
    }

    await this.database.client.$transaction(async (transaction) => {
      const credentialUpdate = await transaction.socialCredential.updateMany({
        where: {
          id: record.credentialRef,
          platform: 'THREADS',
          updatedAt: record.expectedCredentialUpdatedAt,
        },
        data: encryptedCredentialData(record.credential),
      });
      if (credentialUpdate.count !== 1) {
        throw new ConflictException({
          code: 'THREADS_CREDENTIAL_REFRESH_CONFLICT',
          message: 'Threads credential changed while it was being refreshed',
        });
      }

      const accountUpdate = await transaction.socialAccount.updateMany({
        where: {
          id: record.accountId,
          platform: 'THREADS',
          credentialRef: record.credentialRef,
        },
        data: {
          displayName: record.displayName,
          status: 'CONNECTED',
          expiresAt: new Date(record.expiresAt),
        },
      });
      if (accountUpdate.count !== 1) {
        throw new ConflictException({
          code: 'THREADS_ACCOUNT_REFRESH_CONFLICT',
          message: 'Threads account changed while its credential was being refreshed',
        });
      }

      await transaction.destination.updateMany({
        where: {
          socialAccountId: record.accountId,
          platform: 'THREADS',
        },
        data: {
          name: record.displayName,
          enabled: true,
          postingMode: 'API',
        },
      });
    });
  }

  async markStatus(accountId: string, status: 'EXPIRED' | 'REVOKED' | 'ERROR'): Promise<void> {
    await this.database.client.socialAccount.updateMany({
      where: { id: accountId, platform: 'THREADS' },
      data: { status },
    });
  }

  async promote(record: ThreadsPromotionRecord): Promise<PromotedThreadsAccount> {
    if (record.credential.platform !== 'THREADS') {
      throw new ConflictException({
        code: 'THREADS_CREDENTIAL_PLATFORM_MISMATCH',
        message: 'Threads credential platform does not match the selected account',
      });
    }

    return this.database.client.$transaction(async (transaction) => {
      const credentialData = encryptedCredentialData(record.credential);
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
