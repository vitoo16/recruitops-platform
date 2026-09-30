import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { EncryptedOAuthCredential } from '../social-credentials/oauth-credential-cipher.js';

export interface TikTokPromotionRecord {
  externalAccountId: string;
  displayName: string;
  scopes: readonly string[];
  expiresAt: string;
  credential: EncryptedOAuthCredential;
}

export interface TikTokConnectedAccount {
  id: string;
  externalAccountId: string;
  displayName: string;
  status: 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';
  scopes: readonly string[];
  expiresAt: string | null;
}

export interface TikTokPublishingCredentialRecord {
  id: string;
  status: 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';
  scopes: readonly string[];
  expiresAt: Date | null;
  credential: EncryptedOAuthCredential | null;
}

function dbBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

function credentialData(credential: EncryptedOAuthCredential) {
  return {
    platform: credential.platform,
    keyId: credential.keyId,
    algorithm: credential.algorithm,
    iv: dbBytes(credential.iv),
    authTag: dbBytes(credential.authTag),
    ciphertext: dbBytes(credential.ciphertext),
  };
}

@Injectable()
export class TikTokConnectionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(): Promise<readonly TikTokConnectedAccount[]> {
    const accounts = await this.database.client.socialAccount.findMany({
      where: { platform: 'TIKTOK' },
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
      ...account,
      expiresAt: account.expiresAt?.toISOString() ?? null,
    }));
  }

  async findPublishingCredential(accountId: string): Promise<TikTokPublishingCredentialRecord | null> {
    const account = await this.database.client.socialAccount.findFirst({
      where: { id: accountId, platform: 'TIKTOK' },
      select: {
        id: true,
        status: true,
        scopes: true,
        expiresAt: true,
        credential: {
          select: {
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
    if (!account) return null;

    const credential = account.credential;
    return {
      id: account.id,
      status: account.status,
      scopes: account.scopes,
      expiresAt: account.expiresAt,
      credential:
        credential && credential.platform === 'TIKTOK' && credential.algorithm === 'aes-256-gcm'
          ? {
              platform: 'TIKTOK',
              keyId: credential.keyId,
              algorithm: 'aes-256-gcm',
              iv: credential.iv,
              authTag: credential.authTag,
              ciphertext: credential.ciphertext,
            }
          : null,
    };
  }

  async promote(record: TikTokPromotionRecord) {
    if (record.credential.platform !== 'TIKTOK') {
      throw new ConflictException({
        code: 'TIKTOK_CREDENTIAL_PLATFORM_MISMATCH',
        message: 'TikTok credential platform mismatch',
      });
    }
    return this.database.client.$transaction(async (tx) => {
      const encrypted = credentialData(record.credential);
      const expiresAt = new Date(record.expiresAt);
      const existing = await tx.socialAccount.findFirst({
        where: { platform: 'TIKTOK', externalAccountId: record.externalAccountId },
        select: { id: true, credentialRef: true },
      });
      let socialAccountId: string;
      if (existing) {
        socialAccountId = existing.id;
        await tx.socialAccount.update({
          where: { id: existing.id },
          data: {
            displayName: record.displayName,
            status: 'CONNECTED',
            scopes: [...record.scopes],
            expiresAt,
          },
        });
        if (existing.credentialRef) {
          await tx.socialCredential.update({
            where: { id: existing.credentialRef },
            data: encrypted,
          });
        } else {
          const credential = await tx.socialCredential.create({ data: encrypted });
          await tx.socialAccount.update({
            where: { id: existing.id },
            data: { credentialRef: credential.id },
          });
        }
      } else {
        const credential = await tx.socialCredential.create({ data: encrypted });
        const account = await tx.socialAccount.create({
          data: {
            platform: 'TIKTOK',
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

      const destination = await tx.destination.findFirst({
        where: {
          socialAccountId,
          platform: 'TIKTOK',
          externalId: record.externalAccountId,
        },
        select: { id: true },
      });
      if (destination) {
        await tx.destination.update({
          where: { id: destination.id },
          data: { type: 'PROFILE', name: record.displayName, postingMode: 'API', enabled: true },
        });
        return { socialAccountId, destinationId: destination.id };
      }
      const created = await tx.destination.create({
        data: {
          platform: 'TIKTOK',
          type: 'PROFILE',
          name: record.displayName,
          externalId: record.externalAccountId,
          postingMode: 'API',
          enabled: true,
          socialAccountId,
        },
        select: { id: true },
      });
      return { socialAccountId, destinationId: created.id };
    });
  }
}
