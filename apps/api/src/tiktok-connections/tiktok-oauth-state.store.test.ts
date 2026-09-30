import { describe, expect, it, vi } from 'vitest';
import type { RedisService } from '../redis/redis.service.js';
import {
  TIKTOK_OAUTH_STATE_TTL_SECONDS,
  TikTokOAuthStateStore,
} from './tiktok-oauth-state.store.js';

const state = 'a'.repeat(43);
const userId = '2ca934f4-8e91-4c9f-a64b-04f7cf992f88';

describe('TikTokOAuthStateStore', () => {
  it('stores only the hashed state with a bounded TTL', async () => {
    const client = { set: vi.fn().mockResolvedValue('OK') };
    const redis = { getClient: vi.fn().mockResolvedValue(client) } as unknown as RedisService;
    const store = new TikTokOAuthStateStore(redis);
    await store.create({ state, userId });
    const [key, raw, options] = client.set.mock.calls[0]!;
    expect(key).toMatch(/^recruitops:oauth:tiktok:v1:state:[a-f0-9]{64}$/);
    expect(key).not.toContain(state);
    expect(raw).not.toContain(state);
    expect(options).toEqual({ EX: TIKTOK_OAUTH_STATE_TTL_SECONDS, NX: true });
  });

  it('consumes state atomically with GETDEL', async () => {
    const raw = JSON.stringify({ userId, createdAt: '2026-09-30T04:00:00.000Z' });
    const client = { getDel: vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(null) };
    const redis = { getClient: vi.fn().mockResolvedValue(client) } as unknown as RedisService;
    const store = new TikTokOAuthStateStore(redis);
    await expect(store.consume(state)).resolves.toMatchObject({ userId });
    await expect(store.consume(state)).resolves.toBeNull();
  });
});
