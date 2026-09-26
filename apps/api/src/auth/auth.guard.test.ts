import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard.js';
import type { SupabaseAuthService } from './supabase-auth.service.js';

function createContext(authorization?: string): {
  context: ExecutionContext;
  request: { header: (name: string) => string | undefined; user?: unknown };
} {
  const request = {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  } as { header: (name: string) => string | undefined; user?: unknown };

  return {
    request,
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
        getNext: () => undefined,
      }),
    } as unknown as ExecutionContext,
  };
}

describe('AuthGuard', () => {
  it('rejects requests without a bearer token', async () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as SupabaseAuthService;
    const guard = new AuthGuard(authService);
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the verified principal to the request', async () => {
    const principal = {
      id: '2f5646d5-4a8b-4514-859a-a9c5a1909890',
      email: 'recruiter@example.com',
      role: 'RECRUITER' as const,
    };
    const verifyAccessToken = vi.fn().mockResolvedValue(principal);
    const authService = { verifyAccessToken } as unknown as SupabaseAuthService;
    const guard = new AuthGuard(authService);
    const { context, request } = createContext('Bearer verified-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAccessToken).toHaveBeenCalledWith('verified-token');
    expect(request.user).toEqual(principal);
  });
});
