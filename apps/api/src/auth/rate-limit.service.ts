import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';

const DEFAULT_MAX_REQUESTS = 120;
const DEFAULT_WINDOW_SECONDS = 60;

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function hashPrincipalId(principalId: string): string {
  return createHash('sha256').update(principalId).digest('hex').slice(0, 32);
}

function parseScriptResult(result: unknown): [number, number] {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error('Invalid Redis rate-limit response');
  }

  const current = Number(result[0]);
  const ttl = Number(result[1]);
  if (!Number.isFinite(current) || !Number.isFinite(ttl)) {
    throw new Error('Invalid Redis rate-limit counters');
  }

  return [current, ttl];
}

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async consumePrincipal(principalId: string): Promise<RateLimitDecision> {
    const limit = parsePositiveInteger(process.env.API_RATE_LIMIT_MAX_REQUESTS, DEFAULT_MAX_REQUESTS);
    const windowSeconds = parsePositiveInteger(
      process.env.API_RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_WINDOW_SECONDS,
    );
    const principalHash = hashPrincipalId(principalId);
    const key = `recruitops:api-rate-limit:principal:${principalHash}`;
    const client = await this.redis.getClient();
    const result = await client.eval(RATE_LIMIT_SCRIPT, {
      keys: [key],
      arguments: [String(windowSeconds)],
    });
    const [current, ttl] = parseScriptResult(result);
    const allowed = current <= limit;

    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - current),
      retryAfterSeconds: allowed ? 0 : Math.max(1, ttl > 0 ? ttl : windowSeconds),
    };
  }
}
