import { createHash, randomUUID } from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { MetaConnectionTarget } from '@recruitops/integrations';
import { z } from 'zod';
import { RedisService } from '../redis/redis.service.js';
import type { EncryptedOAuthCredential } from '../social-credentials/oauth-credential-cipher.js';

export const META_OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const META_OAUTH_SELECTION_TTL_SECONDS = 15 * 60;

const META_OAUTH_KEY_PREFIX = 'recruitops:oauth:meta:v1';
const MetaConnectionTargetSchema = z.enum(['FACEBOOK', 'INSTAGRAM']);

const InstagramProfessionalAccountSchema = z
  .object({
    id: z.string().trim().min(1).max(255),
    username: z.string().trim().min(1).max(255).optional(),
    name: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export const MetaDiscoveredAccountSchema = z
  .object({
    pageId: z.string().trim().min(1).max(255),
    pageName: z.string().trim().min(1).max(255),
    tasks: z.array(z.string().trim().min(1).max(255)).max(100),
    instagramProfessionalAccount: InstagramProfessionalAccountSchema.nullable(),
  })
  .strict();

export type MetaDiscoveredAccount = z.infer<typeof MetaDiscoveredAccountSchema>;

const PendingMetaOAuthSessionSchema = z
  .object({
    userId: z.uuid(),
    targets: z.array(MetaConnectionTargetSchema).min(1).max(2),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const EncryptedCredentialSchema = z
  .object({
    platform: z.literal('FACEBOOK'),
    keyId: z.string().trim().min(1).max(64),
    algorithm: z.literal('aes-256-gcm'),
    iv: z.string().min(1),
    authTag: z.string().min(1),
    ciphertext: z.string().min(1),
  })
  .strict();

const MetaOAuthSelectionSessionSchema = z
  .object({
    userId: z.uuid(),
    targets: z.array(MetaConnectionTargetSchema).min(1).max(2),
    encryptedUserToken: EncryptedCredentialSchema,
    accounts: z.array(MetaDiscoveredAccountSchema).max(500),
    createdAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export interface PendingMetaOAuthSession {
  userId: string;
  targets: readonly MetaConnectionTarget[];
  createdAt: string;
}

export interface MetaOAuthSelectionSession {
  userId: string;
  targets: readonly MetaConnectionTarget[];
  encryptedUserToken: EncryptedOAuthCredential;
  accounts: readonly MetaDiscoveredAccount[];
  createdAt: string;
  expiresAt: string;
}

function stateKey(state: string): string {
  const digest = createHash('sha256').update(state, 'utf8').digest('hex');
  return `${META_OAUTH_KEY_PREFIX}:state:${digest}`;
}

function selectionKey(connectionSessionId: string): string {
  return `${META_OAUTH_KEY_PREFIX}:selection:${connectionSessionId}`;
}

function corruptSession(): InternalServerErrorException {
  return new InternalServerErrorException({
    code: 'META_OAUTH_SESSION_CORRUPT',
    message: 'Stored Meta OAuth session is invalid',
  });
}

function parseStored<TSchema extends z.ZodType>(schema: TSchema, raw: string): z.output<TSchema> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw corruptSession();
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) throw corruptSession();
  return parsed.data;
}

function serializeCredential(encrypted: EncryptedOAuthCredential) {
  return {
    platform: encrypted.platform,
    keyId: encrypted.keyId,
    algorithm: encrypted.algorithm,
    iv: Buffer.from(encrypted.iv).toString('base64'),
    authTag: Buffer.from(encrypted.authTag).toString('base64'),
    ciphertext: Buffer.from(encrypted.ciphertext).toString('base64'),
  };
}

function deserializeCredential(
  encrypted: z.infer<typeof EncryptedCredentialSchema>,
): EncryptedOAuthCredential {
  return {
    platform: encrypted.platform,
    keyId: encrypted.keyId,
    algorithm: encrypted.algorithm,
    iv: Buffer.from(encrypted.iv, 'base64'),
    authTag: Buffer.from(encrypted.authTag, 'base64'),
    ciphertext: Buffer.from(encrypted.ciphertext, 'base64'),
  };
}

@Injectable()
export class MetaOAuthSessionStore {
  constructor(private readonly redis: RedisService) {}

  async createPending(input: {
    state: string;
    userId: string;
    targets: readonly MetaConnectionTarget[];
  }): Promise<{ expiresAt: string }> {
    const now = Date.now();
    const record = PendingMetaOAuthSessionSchema.parse({
      userId: input.userId,
      targets: input.targets,
      createdAt: new Date(now).toISOString(),
    });
    const client = await this.redis.getClient();
    const result = await client.set(stateKey(input.state), JSON.stringify(record), {
      EX: META_OAUTH_STATE_TTL_SECONDS,
      NX: true,
    });

    if (result !== 'OK') {
      throw new InternalServerErrorException({
        code: 'META_OAUTH_STATE_STORE_FAILED',
        message: 'Could not create Meta OAuth state',
      });
    }

    return {
      expiresAt: new Date(now + META_OAUTH_STATE_TTL_SECONDS * 1_000).toISOString(),
    };
  }

  async consumePending(state: string): Promise<PendingMetaOAuthSession | null> {
    const client = await this.redis.getClient();
    const raw = await client.getDel(stateKey(state));
    if (!raw) return null;
    return parseStored(PendingMetaOAuthSessionSchema, raw);
  }

  async createSelection(input: {
    userId: string;
    targets: readonly MetaConnectionTarget[];
    encryptedUserToken: EncryptedOAuthCredential;
    accounts: readonly MetaDiscoveredAccount[];
  }): Promise<{ connectionSessionId: string; expiresAt: string }> {
    const now = Date.now();
    const connectionSessionId = randomUUID();
    const expiresAt = new Date(now + META_OAUTH_SELECTION_TTL_SECONDS * 1_000).toISOString();
    const record = MetaOAuthSelectionSessionSchema.parse({
      userId: input.userId,
      targets: input.targets,
      encryptedUserToken: serializeCredential(input.encryptedUserToken),
      accounts: input.accounts,
      createdAt: new Date(now).toISOString(),
      expiresAt,
    });
    const client = await this.redis.getClient();
    const result = await client.set(selectionKey(connectionSessionId), JSON.stringify(record), {
      EX: META_OAUTH_SELECTION_TTL_SECONDS,
      NX: true,
    });

    if (result !== 'OK') {
      throw new InternalServerErrorException({
        code: 'META_OAUTH_SELECTION_STORE_FAILED',
        message: 'Could not create Meta OAuth selection session',
      });
    }

    return { connectionSessionId, expiresAt };
  }

  async getSelectionForUser(
    connectionSessionId: string,
    userId: string,
  ): Promise<MetaOAuthSelectionSession | null> {
    const client = await this.redis.getClient();
    const raw = await client.get(selectionKey(connectionSessionId));
    if (!raw) return null;
    const stored = parseStored(MetaOAuthSelectionSessionSchema, raw);
    if (stored.userId !== userId) return null;

    return {
      userId: stored.userId,
      targets: stored.targets,
      encryptedUserToken: deserializeCredential(stored.encryptedUserToken),
      accounts: stored.accounts,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
    };
  }

  async deleteSelection(connectionSessionId: string): Promise<void> {
    const client = await this.redis.getClient();
    await client.del(selectionKey(connectionSessionId));
  }
}
