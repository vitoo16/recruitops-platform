import { createHash } from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { z } from 'zod';
import { RedisService } from '../redis/redis.service.js';

export const LINKEDIN_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const LINKEDIN_OAUTH_KEY_PREFIX = 'recruitops:oauth:linkedin:v1';

const PendingLinkedInOAuthSessionSchema = z
  .object({
    userId: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export interface PendingLinkedInOAuthSession {
  userId: string;
  createdAt: string;
}

function stateKey(state: string): string {
  const digest = createHash('sha256').update(state, 'utf8').digest('hex');
  return `${LINKEDIN_OAUTH_KEY_PREFIX}:state:${digest}`;
}

function corruptSession(): InternalServerErrorException {
  return new InternalServerErrorException({
    code: 'LINKEDIN_OAUTH_SESSION_CORRUPT',
    message: 'Stored LinkedIn OAuth session is invalid',
  });
}

function parseStored(raw: string): PendingLinkedInOAuthSession {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw corruptSession();
  }

  const parsed = PendingLinkedInOAuthSessionSchema.safeParse(json);
  if (!parsed.success) throw corruptSession();
  return parsed.data;
}

@Injectable()
export class LinkedInOAuthStateStore {
  constructor(private readonly redis: RedisService) {}

  async create(input: { state: string; userId: string }): Promise<{ expiresAt: string }> {
    const now = Date.now();
    const record = PendingLinkedInOAuthSessionSchema.parse({
      userId: input.userId,
      createdAt: new Date(now).toISOString(),
    });
    const client = await this.redis.getClient();
    const result = await client.set(stateKey(input.state), JSON.stringify(record), {
      EX: LINKEDIN_OAUTH_STATE_TTL_SECONDS,
      NX: true,
    });

    if (result !== 'OK') {
      throw new InternalServerErrorException({
        code: 'LINKEDIN_OAUTH_STATE_STORE_FAILED',
        message: 'Could not create LinkedIn OAuth state',
      });
    }

    return {
      expiresAt: new Date(now + LINKEDIN_OAUTH_STATE_TTL_SECONDS * 1_000).toISOString(),
    };
  }

  async consume(state: string): Promise<PendingLinkedInOAuthSession | null> {
    const client = await this.redis.getClient();
    const raw = await client.getDel(stateKey(state));
    return raw ? parseStored(raw) : null;
  }
}
