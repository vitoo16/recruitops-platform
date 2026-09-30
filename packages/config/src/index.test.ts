import { describe, expect, it } from 'vitest';
import { parseApiEnv } from './index.js';

describe('parseApiEnv CORS security', () => {
  it('keeps localhost http available for development', () => {
    expect(
      parseApiEnv({
        NODE_ENV: 'development',
        CORS_ORIGINS: 'http://localhost:3000',
      }).CORS_ORIGINS,
    ).toEqual(['http://localhost:3000']);
  });

  it('normalizes safe origins and supports multiple explicit origins', () => {
    expect(
      parseApiEnv({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://recruitops.example.com/, https://admin.example.com',
      }).CORS_ORIGINS,
    ).toEqual(['https://recruitops.example.com', 'https://admin.example.com']);
  });

  it.each([
    '*',
    'https://example.com/private',
    'https://example.com?tenant=1',
    'https://example.com#fragment',
    'https://user:password@example.com',
    'ftp://example.com',
  ])('rejects unsafe CORS origin %s', (origin) => {
    expect(() =>
      parseApiEnv({
        NODE_ENV: 'development',
        CORS_ORIGINS: origin,
      }),
    ).toThrow();
  });

  it('rejects duplicate origins after normalization', () => {
    expect(() =>
      parseApiEnv({
        NODE_ENV: 'development',
        CORS_ORIGINS: 'http://localhost:3000,http://localhost:3000/',
      }),
    ).toThrow();
  });

  it('requires https CORS origins in production', () => {
    expect(() =>
      parseApiEnv({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'http://recruitops.example.com',
      }),
    ).toThrow();
  });
});
