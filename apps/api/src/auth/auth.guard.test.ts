import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import { AuthGuard } from './auth.guard.js';
import type { SupabaseAuthService } from './supabase-auth.service.js';

function createContext(authorization?: string): {
  context: ExecutionContext;
  request: {
    header: (name: string) => string | undefined;
    user?: unknown;
    requestId: string;
    method: string;
    originalUrl: string;
  };
} {
  const request = {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
    requestId: 'req-123',
    method: 'GET',
    originalUrl: '/api/auth/me',
  } as {
    header: (name: string) => string | undefined;
    user?: unknown;
    requestId: string;
    method: string;
    originalUrl: string;
  };

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

function createAuditService() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe('AuthGuard', () => {
  it('rejects and audits requests without a bearer token', async () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as SupabaseAuthService;
    const auditService = createAuditService();
    const guard = new AuthGuard(authService, auditService);
    const { context } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'AUTHENTICATION_FAILURE',
        reasonCode: 'MISSING_BEARER_TOKEN',
        requestId: 'req-123',
      }),
    );
  });

  it('attaches the verified principal and records a successful authentication event', async () => {
    const principal = {
      id: '2f5646d5-4a8b-4514-859a-a9c5a1909890',
      email: 'recruiter@example.com',
      role: 'RECRUITER' as const,
    };
    const verifyAccessToken = vi.fn().mockResolvedValue(principal);
    const authService = { verifyAccessToken } as unknown as SupabaseAuthService;
    const auditService = createAuditService();
    const guard = new AuthGuard(authService, auditService);
    const { context, request } = createContext('Bearer verified-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAccessToken).toHaveBeenCalledWith('verified-token');
    expect(request.user).toEqual(principal);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'AUTHENTICATION_SUCCESS',
        actorId: principal.id,
        actorRole: 'RECRUITER',
      }),
    );
  });

  it('records invalid token failures without logging the bearer token', async () => {
    const authService = {
      verifyAccessToken: vi.fn().mockRejectedValue(new UnauthorizedException('invalid')),
    } as unknown as SupabaseAuthService;
    const auditService = createAuditService();
    const guard = new AuthGuard(authService, auditService);
    const { context } = createContext('Bearer super-secret-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    const event = vi.mocked(auditService.record).mock.calls[0]?.[0];
    expect(event).toEqual(
      expect.objectContaining({
        eventType: 'AUTHENTICATION_FAILURE',
        reasonCode: 'INVALID_ACCESS_TOKEN',
      }),
    );
    expect(JSON.stringify(event)).not.toContain('super-secret-token');
  });
});
