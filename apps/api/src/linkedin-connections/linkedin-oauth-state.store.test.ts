import { describe, expect, it, vi } from 'vitest';
import type { RedisService } from '../redis/redis.service.js';
import {
  LINKEDIN_OAUTH_STATE_TTL_SECONDS,
  LinkedInOAuthStateStore,
} from './linkedin-oauth-state.store.js';

const userId = '2ca934f4-8e91-4c9f-a64b-04f7cf992f88';
const state = 'a'.repeat(43);

describe('LinkedInOAuthStateStore', () => {
  it('stores only a hashed state key with a bounded TTL', async () => {
    const client = {
      set: vi.fn().mockResolvedValue('OK'),
    };
    const redis = {
      getClient: vi.fn().mockResolvedValue(client),
    } as unknown as RedisService;
    const store = new LinkedInOAuthStateStore(redis);

    await store.create({ state, userId });

    expect(client.set).toHaveBeenCalledOnce();
    const [key, serialized, options] = client.set.mock.calls[0]!;
    expect(key).toMatch(/^recruitops:oauth:linkedin:v1:state:[a-f0-9]{64}$/);
    expect(key).not.toContain(state);
    expect(serialized).not.toContain(state);
    expect(JSON.parse(serialized)).toMatchObject({ userId });
    expect(options).toEqual({ EX: LINKEDIN_OAUTH_STATE_TTL_SECONDS, NX: true });
  });

  it('atomically consumes state with GETDEL so replay returns no session', async () => {
    const serialized = JSON.stringify({
      userId,
      createdAt: '2026-09-30T03:50:00.000Z',
    });
    const client = {
      getDel: vi.fn().mockResolvedValueOnce(serialized).mockResolvedValueOnce(null),
    };
    const redis = {
      getClient: vi.fn().mockResolvedValue(client),
    } as unknown as RedisService;
    const store = new LinkedInOAuthStateStore(redis);

    await expect(store.consume(state)).resolves.toEqual({
      userId,
      createdAt: '2026-09-30T03:50:00.000Z',
    });
    await expect(store.consume(state)).resolves.toBeNull();
  });
});
