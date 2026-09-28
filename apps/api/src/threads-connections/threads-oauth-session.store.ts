import { createHash } from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { z } from 'zod';
import { RedisService } from '../redis/redis.service.js';

export const THREADS_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const THREADS_OAUTH_KEY_PREFIX = 'recruitops:oauth:threads:v1';

const PendingThreadsOAuthSessionSchema = z
  .object({
    userId: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export interface PendingThreadsOAuthSession {
  userId: string;
  createdAt: string;
}

function stateKey(state: string): string {
  const digest = createHash('sha256').update(state, 'utf8').digest('hex');
  return `${THREADS_OAUTH_KEY_PREFIX}:state:${digest}`;
}

function corruptSession(): InternalServerErrorException {
  return new InternalServerErrorException({
    code: 'THREADS_OAUTH_SESSION_CORRUPT',
    message: 'Stored Threads OAuth session is invalid',
  });
}

@Injectable()
export class ThreadsOAuthSessionStore {
  constructor(private readonly redis: RedisService) {}

  async createPending(input: { state: string; userId: string }): Promise<{ expiresAt: string }> {
    const now = Date.now();
    const record = PendingThreadsOAuthSessionSchema.parse({
      userId: input.userId,
      createdAt: new Date(now).toISOString(),
    });
    const client = await this.redis.getClient();
    const result = await client.set(stateKey(input.state), JSON.stringify(record), {
      EX: THREADS_OAUTH_STATE_TTL_SECONDS,
      NX: true,
    });
    if (result !== 'OK') {
      throw new InternalServerErrorException({
        code: 'THREADS_OAUTH_STATE_STORE_FAILED',
        message: 'Could not create Threads OAuth state',
      });
    }
    return {
      expiresAt: new Date(now + THREADS_OAUTH_STATE_TTL_SECONDS * 1_000).toISOString(),
    };
  }

  async consumePending(state: string): Promise<PendingThreadsOAuthSession | null> {
    const client = await this.redis.getClient();
    const raw = await client.getDel(stateKey(state));
    if (!raw) return null;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw corruptSession();
    }
    const parsed = PendingThreadsOAuthSessionSchema.safeParse(json);
    if (!parsed.success) throw corruptSession();
    return parsed.data;
  }
}
