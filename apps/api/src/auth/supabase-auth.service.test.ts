import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { SupabaseAuthService } from './supabase-auth.service.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe('SupabaseAuthService', () => {
  it('returns a validated principal and admin-controlled role', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: '2f5646d5-4a8b-4514-859a-a9c5a1909890',
            email: 'recruiter@example.com',
            app_metadata: { recruitops_role: 'RECRUITER' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const principal = await new SupabaseAuthService().verifyAccessToken('valid-token');

    expect(principal).toEqual({
      id: '2f5646d5-4a8b-4514-859a-a9c5a1909890',
      email: 'recruiter@example.com',
      role: 'RECRUITER',
    });
  });

  it('defaults unknown or absent application roles to VIEWER', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: '2f5646d5-4a8b-4514-859a-a9c5a1909890',
            email: null,
            app_metadata: { recruitops_role: 'SUPERUSER' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(new SupabaseAuthService().verifyAccessToken('valid-token')).resolves.toMatchObject({
      role: 'VIEWER',
    });
  });

  it('rejects tokens the Auth server does not accept', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));

    await expect(new SupabaseAuthService().verifyAccessToken('bad-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('fails closed when the auth provider is not configured', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;

    await expect(new SupabaseAuthService().verifyAccessToken('token')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
