import { describe, expect, it, vi } from 'vitest';
import type { RedisService } from '../redis/redis.service.js';
import {
  META_OAUTH_SELECTION_TTL_SECONDS,
  META_OAUTH_STATE_TTL_SECONDS,
  MetaOAuthSessionStore,
} from './meta-oauth-session.store.js';

function createRedisHarness() {
  const values = new Map<string, string>();
  const client = {
    set: vi.fn(async (key: string, value: string, options?: { EX?: number; NX?: boolean }) => {
      if (options?.NX && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    }),
    getDel: vi.fn(async (key: string) => {
      const value = values.get(key) ?? null;
      values.delete(key);
      return value;
    }),
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    del: vi.fn(async (key: string) => (values.delete(key) ? 1 : 0)),
  };
  const redis = {
    getClient: vi.fn().mockResolvedValue(client),
  } as unknown as RedisService;

  return { values, client, redis };
}

describe('MetaOAuthSessionStore', () => {
  it('stores only a SHA-256-derived state key and consumes it exactly once', async () => {
    const { client, redis } = createRedisHarness();
    const store = new MetaOAuthSessionStore(redis);
    const state = 'a'.repeat(43);
    const userId = '11111111-1111-4111-8111-111111111111';

    const created = await store.createPending({
      state,
      userId,
      targets: ['FACEBOOK'],
    });

    const [storedKey, storedValue, options] = client.set.mock.calls[0]!;
    expect(storedKey).not.toContain(state);
    expect(storedValue).not.toContain(state);
    expect(options).toEqual({ EX: META_OAUTH_STATE_TTL_SECONDS, NX: true });
    expect(new Date(created.expiresAt).getTime()).toBeGreaterThan(Date.now());

    await expect(store.consumePending(state)).resolves.toMatchObject({
      userId,
      targets: ['FACEBOOK'],
    });
    await expect(store.consumePending(state)).resolves.toBeNull();
  });

  it('stores selection sessions with TTL and returns them only to the owning user', async () => {
    const { client, redis } = createRedisHarness();
    const store = new MetaOAuthSessionStore(redis);
    const ownerId = '22222222-2222-4222-8222-222222222222';
    const otherUserId = '33333333-3333-4333-8333-333333333333';

    const created = await store.createSelection({
      userId: ownerId,
      targets: ['FACEBOOK', 'INSTAGRAM'],
      encryptedUserToken: {
        platform: 'FACEBOOK',
        keyId: 'key-1',
        algorithm: 'aes-256-gcm',
        iv: Uint8Array.from([1, 2, 3]),
        authTag: Uint8Array.from([4, 5, 6]),
        ciphertext: Uint8Array.from([7, 8, 9]),
      },
      accounts: [
        {
          pageId: '123',
          pageName: 'RecruitOps',
          tasks: ['PROFILE_PLUS_CREATE_CONTENT'],
          instagramProfessionalAccount: {
            id: '456',
            username: 'recruitops',
          },
        },
      ],
    });

    const [, , options] = client.set.mock.calls[0]!;
    expect(options).toEqual({ EX: META_OAUTH_SELECTION_TTL_SECONDS, NX: true });

    await expect(
      store.getSelectionForUser(created.connectionSessionId, otherUserId),
    ).resolves.toBeNull();
    await expect(
      store.getSelectionForUser(created.connectionSessionId, ownerId),
    ).resolves.toMatchObject({
      userId: ownerId,
      targets: ['FACEBOOK', 'INSTAGRAM'],
      accounts: [{ pageId: '123', pageName: 'RecruitOps' }],
    });
  });
});
