import { HttpException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import { AuthGuard } from './auth.guard.js';
import type { RateLimitService } from './rate-limit.service.js';
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
  response: {
    setHeader: ReturnType<typeof vi.fn>;
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
  const response = { setHeader: vi.fn() };

  return {
    request,
    response,
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
        getNext: () => undefined,
      }),
    } as unknown as ExecutionContext,
  };
}

function createAuditService() {
  return { record: vi.fn() } as unknown as AuditService;
}

function createRateLimitService(overrides: Partial<{ allowed: boolean; limit: number; remaining: number; retryAfterSeconds: number }> = {}) {
  const decision = {
    allowed: true,
    limit: 120,
    remaining: 119,
    retryAfterSeconds: 0,
    ...overrides,
  };
  return {
    consumePrincipal: vi.fn().mockResolvedValue(decision),
  } as unknown as RateLimitService;
}

describe('AuthGuard', () => {
  it('rejects and audits requests without a bearer token', async () => {
    const authService = {
      verifyAccessToken: vi.fn(),
    } as unknown as SupabaseAuthService;
    const auditService = createAuditService();
    const rateLimitService = createRateLimitService();
    const guard = new AuthGuard(authService, auditService, rateLimitService);
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

  it('attaches the verified principal, consumes its shared quota and records success', async () => {
    const principal = {
      id: '2f5646d5-4a8b-4514-859a-a9c5a1909890',
      email: 'recruiter@example.com',
      role: 'RECRUITER' as const,
    };
    const verifyAccessToken = vi.fn().mockResolvedValue(principal);
    const authService = { verifyAccessToken } as unknown as SupabaseAuthService;
    const auditService = createAuditService();
    const rateLimitService = createRateLimitService();
    const guard = new AuthGuard(authService, auditService, rateLimitService);
    const { context, request, response } = createContext('Bearer verified-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAccessToken).toHaveBeenCalledWith('verified-token');
    expect(request.user).toEqual(principal);
    expect(rateLimitService.consumePrincipal).toHaveBeenCalledWith(principal.id);
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '120');
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '119');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'AUTHENTICATION_SUCCESS',
        actorId: principal.id,
        actorRole: 'RECRUITER',
      }),
    );
  });

  it('returns 429 and retry metadata when a principal exceeds the shared quota', async () => {
    const principal = {
      id: '2f5646d5-4a8b-4514-859a-a9c5a1909890',
      email: 'recruiter@example.com',
      role: 'RECRUITER' as const,
    };
    const authService = {
      verifyAccessToken: vi.fn().mockResolvedValue(principal),
    } as unknown as SupabaseAuthService;
    const auditService = createAuditService();
    const rateLimitService = createRateLimitService({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 23,
    });
    const guard = new AuthGuard(authService, auditService, rateLimitService);
    const { context, response } = createContext('Bearer verified-token');

    const error = await guard.canActivate(context).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '23');
    expect(auditService.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'AUTHENTICATION_SUCCESS' }),
    );
  });

  it('records invalid token failures without logging the bearer token', async () => {
    const authService = {
      verifyAccessToken: vi.fn().mockRejectedValue(new UnauthorizedException('invalid')),
    } as unknown as SupabaseAuthService;
    const auditService = createAuditService();
    const rateLimitService = createRateLimitService();
    const guard = new AuthGuard(authService, auditService, rateLimitService);
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
