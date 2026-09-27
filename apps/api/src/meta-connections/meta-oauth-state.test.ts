import { describe, expect, it } from 'vitest';
import { issueMetaOAuthState, verifyMetaOAuthState } from './meta-oauth-state.js';

const actorId = '550e8400-e29b-41d4-a716-446655440000';
const secret = 'state-secret-that-is-definitely-at-least-32-bytes';
const now = Date.parse('2026-09-28T00:00:00.000Z');

describe('Meta OAuth state', () => {
  it('round-trips a signed actor binding', () => {
    const issued = issueMetaOAuthState(actorId, secret, now);
    expect(issued.expiresAt).toBe('2026-09-28T00:10:00.000Z');
    expect(verifyMetaOAuthState(issued.state, secret, now + 1_000)).toEqual({ actorId });
  });

  it('rejects signature tampering', () => {
    const issued = issueMetaOAuthState(actorId, secret, now);
    const [payload, signature] = issued.state.split('.');
    expect(() => verifyMetaOAuthState(`${payload}x.${signature}`, secret, now + 1_000)).toThrow(
      'META_OAUTH_STATE_INVALID',
    );
  });

  it('rejects expired state', () => {
    const issued = issueMetaOAuthState(actorId, secret, now);
    expect(() => verifyMetaOAuthState(issued.state, secret, now + 10 * 60 * 1000)).toThrow(
      'META_OAUTH_STATE_EXPIRED',
    );
  });
});
