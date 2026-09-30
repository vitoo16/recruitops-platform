import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RedisService } from '../redis/redis.service.js';
import { RateLimitService } from './rate-limit.service.js';

function createRedisService(result: unknown) {
  const evalMock = vi.fn().mockResolvedValue(result);
  const redis = {
    getClient: vi.fn().mockResolvedValue({ eval: evalMock }),
  } as unknown as RedisService;

  return { redis, evalMock };
}

afterEach(() => {
  delete process.env.API_RATE_LIMIT_MAX_REQUESTS;
  delete process.env.API_RATE_LIMIT_WINDOW_SECONDS;
});

describe('RateLimitService', () => {
  it('allows requests below the shared principal limit without exposing the raw principal id', async () => {
    const { redis, evalMock } = createRedisService([3, 42]);
    const service = new RateLimitService(redis);

    await expect(service.consumePrincipal('user-secret-id')).resolves.toEqual({
      allowed: true,
      limit: 120,
      remaining: 117,
      retryAfterSeconds: 0,
    });

    expect(evalMock).toHaveBeenCalledOnce();
    const [, options] = evalMock.mock.calls[0] as [string, { keys: string[]; arguments: string[] }];
    expect(options.keys[0]).toMatch(/^recruitops:api-rate-limit:principal:[a-f0-9]{32}$/);
    expect(options.keys[0]).not.toContain('user-secret-id');
    expect(options.arguments).toEqual(['60']);
  });

  it('returns retry metadata after the configured quota is exceeded', async () => {
    process.env.API_RATE_LIMIT_MAX_REQUESTS = '2';
    process.env.API_RATE_LIMIT_WINDOW_SECONDS = '30';
    const { redis } = createRedisService([3, 17]);
    const service = new RateLimitService(redis);

    await expect(service.consumePrincipal('principal-123')).resolves.toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 17,
    });
  });

  it('falls back to safe defaults for invalid configuration', async () => {
    process.env.API_RATE_LIMIT_MAX_REQUESTS = '0';
    process.env.API_RATE_LIMIT_WINDOW_SECONDS = 'not-a-number';
    const { redis, evalMock } = createRedisService([1, 60]);
    const service = new RateLimitService(redis);

    const result = await service.consumePrincipal('principal-123');

    expect(result.limit).toBe(120);
    const [, options] = evalMock.mock.calls[0] as [string, { keys: string[]; arguments: string[] }];
    expect(options.arguments).toEqual(['60']);
  });
});
