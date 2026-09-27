import { ForbiddenException, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../audit/audit.service.js';
import { getSafeRequestPath } from '../common/request-path.js';
import type { AppRole } from './auth.types.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!allowedRoles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role;

    if (!role || !allowedRoles.includes(role)) {
      this.auditService.record({
        eventType: 'AUTHORIZATION_DENIED',
        outcome: 'DENIED',
        requestId: request.requestId,
        actorId: request.user?.id,
        actorRole: role,
        method: request.method,
        path: getSafeRequestPath(request),
        reasonCode: 'ROLE_NOT_ALLOWED',
      });
      throw new ForbiddenException('Insufficient role for this operation.');
    }

    return true;
  }
}
