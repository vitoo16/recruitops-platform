import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetaConnectionReturnUrlFactory } from './meta-connection-return-url.factory.js';

function configureMetaEnv() {
  vi.stubEnv('META_CLIENT_ID', 'meta-client');
  vi.stubEnv('META_CLIENT_SECRET', 'meta-secret');
  vi.stubEnv('META_GRAPH_API_VERSION', 'v26.0');
  vi.stubEnv('META_REDIRECT_URI', 'https://api.example.com/api/integrations/meta/oauth/callback');
  vi.stubEnv('META_FRONTEND_REDIRECT_URI', 'https://app.example.com/connect?source=settings#ignore');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('MetaConnectionReturnUrlFactory', () => {
  it('returns to the configured frontend with only non-secret success metadata', () => {
    configureMetaEnv();
    const factory = new MetaConnectionReturnUrlFactory();
    const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    const url = new URL(factory.success(sessionId));

    expect(url.origin).toBe('https://app.example.com');
    expect(url.pathname).toBe('/connect');
    expect(url.hash).toBe('');
    expect(url.searchParams.get('source')).toBe('settings');
    expect(url.searchParams.get('metaConnectionStatus')).toBe('ready');
    expect(url.searchParams.get('metaConnectionSession')).toBe(sessionId);
    expect(url.toString()).not.toContain('token');
    expect(url.toString()).not.toContain('meta-secret');
  });

  it('returns a normalized denied status without a connection session', () => {
    configureMetaEnv();
    const factory = new MetaConnectionReturnUrlFactory();

    const url = new URL(factory.denied());

    expect(url.searchParams.get('metaConnectionStatus')).toBe('denied');
    expect(url.searchParams.has('metaConnectionSession')).toBe(false);
  });

  it('fails closed when the frontend return URL is not configured', () => {
    configureMetaEnv();
    vi.stubEnv('META_FRONTEND_REDIRECT_URI', '');
    const factory = new MetaConnectionReturnUrlFactory();

    expect(() => factory.assertConfigured()).toThrow();
  });
});
