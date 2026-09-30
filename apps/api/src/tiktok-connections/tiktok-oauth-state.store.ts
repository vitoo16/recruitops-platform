import { createHash } from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { z } from 'zod';
import { RedisService } from '../redis/redis.service.js';

export const TIKTOK_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const KEY_PREFIX = 'recruitops:oauth:tiktok:v1';
const StoredSessionSchema = z
  .object({ userId: z.uuid(), createdAt: z.iso.datetime({ offset: true }) })
  .strict();

export interface PendingTikTokOAuthSession {
  userId: string;
  createdAt: string;
}

function stateKey(state: string): string {
  return `${KEY_PREFIX}:state:${createHash('sha256').update(state, 'utf8').digest('hex')}`;
}

function corrupt(): InternalServerErrorException {
  return new InternalServerErrorException({
    code: 'TIKTOK_OAUTH_SESSION_CORRUPT',
    message: 'Stored TikTok OAuth session is invalid',
  });
}

@Injectable()
export class TikTokOAuthStateStore {
  constructor(private readonly redis: RedisService) {}

  async create(input: { state: string; userId: string }): Promise<{ expiresAt: string }> {
    const now = Date.now();
    const record = StoredSessionSchema.parse({
      userId: input.userId,
      createdAt: new Date(now).toISOString(),
    });
    const client = await this.redis.getClient();
    const result = await client.set(stateKey(input.state), JSON.stringify(record), {
      EX: TIKTOK_OAUTH_STATE_TTL_SECONDS,
      NX: true,
    });
    if (result !== 'OK') {
      throw new InternalServerErrorException({
        code: 'TIKTOK_OAUTH_STATE_STORE_FAILED',
        message: 'Could not create TikTok OAuth state',
      });
    }
    return { expiresAt: new Date(now + TIKTOK_OAUTH_STATE_TTL_SECONDS * 1_000).toISOString() };
  }

  async consume(state: string): Promise<PendingTikTokOAuthSession | null> {
    const client = await this.redis.getClient();
    const raw = await client.getDel(stateKey(state));
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw corrupt();
    }
    const result = StoredSessionSchema.safeParse(parsed);
    if (!result.success) throw corrupt();
    return result.data;
  }
}
