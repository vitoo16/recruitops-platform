import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import { RolesGuard } from './roles.guard.js';

function createContext(role: string | undefined): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: role
          ? {
              id: 'user-123',
              role,
            }
          : undefined,
        requestId: 'req-roles-123',
        method: 'POST',
        originalUrl: '/api/admin/example',
      }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function createAuditService() {
  return { record: vi.fn() } as unknown as AuditService;
}

describe('RolesGuard', () => {
  it('allows principals with an explicitly allowed role', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['ADMIN']),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector, createAuditService());

    expect(guard.canActivate(createContext('ADMIN'))).toBe(true);
  });

  it('denies and audits principals without an allowed role', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['OWNER']),
    } as unknown as Reflector;
    const auditService = createAuditService();
    const guard = new RolesGuard(reflector, auditService);

    expect(() => guard.canActivate(createContext('VIEWER'))).toThrow(ForbiddenException);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'AUTHORIZATION_DENIED',
        outcome: 'DENIED',
        actorId: 'user-123',
        actorRole: 'VIEWER',
        requestId: 'req-roles-123',
        reasonCode: 'ROLE_NOT_ALLOWED',
      }),
    );
  });

  it('allows routes with no role metadata', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const auditService = createAuditService();
    const guard = new RolesGuard(reflector, auditService);

    expect(guard.canActivate(createContext(undefined))).toBe(true);
    expect(auditService.record).not.toHaveBeenCalled();
  });
});
