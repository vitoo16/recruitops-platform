import { describe, expect, it } from 'vitest';
import { getSafeRequestPath } from './request-path.js';

describe('getSafeRequestPath', () => {
  it('keeps ordinary request paths unchanged', () => {
    expect(getSafeRequestPath({ originalUrl: '/api/auth/me' })).toBe('/api/auth/me');
  });

  it('removes query parameters so OAuth codes and state are not logged', () => {
    expect(
      getSafeRequestPath({
        originalUrl:
          '/api/integrations/meta/oauth/callback?code=provider-secret-code&state=opaque-state',
      }),
    ).toBe('/api/integrations/meta/oauth/callback');
  });

  it('returns root for an empty path before a query string', () => {
    expect(getSafeRequestPath({ originalUrl: '?code=secret' })).toBe('/');
  });
});
