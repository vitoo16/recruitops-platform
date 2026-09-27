import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { RequestWithContext } from '../common/request-context.js';
import type { AuthenticatedPrincipal } from './auth.types.js';
import { SupabaseAuthService } from './supabase-auth.service.js';

export interface AuthenticatedRequest extends RequestWithContext {
  user?: AuthenticatedPrincipal;
}

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: SupabaseAuthService,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = extractBearerToken(request.header('authorization'));
    const auditContext = {
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl,
    };

    if (!accessToken) {
      this.auditService.record({
        eventType: 'AUTHENTICATION_FAILURE',
        outcome: 'DENIED',
        reasonCode: 'MISSING_BEARER_TOKEN',
        ...auditContext,
      });
      throw new UnauthorizedException('Bearer access token is required.');
    }

    try {
      const principal = await this.authService.verifyAccessToken(accessToken);
      request.user = principal;
      this.auditService.record({
        eventType: 'AUTHENTICATION_SUCCESS',
        outcome: 'SUCCESS',
        actorId: principal.id,
        actorRole: principal.role,
        ...auditContext,
      });
      return true;
    } catch (error) {
      this.auditService.record({
        eventType: 'AUTHENTICATION_FAILURE',
        outcome: 'DENIED',
        reasonCode:
          error instanceof UnauthorizedException ? 'INVALID_ACCESS_TOKEN' : 'AUTH_PROVIDER_ERROR',
        ...auditContext,
      });
      throw error;
    }
  }
}
