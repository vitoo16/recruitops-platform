import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { RequestWithContext } from '../common/request-context.js';
import { getSafeRequestPath } from '../common/request-path.js';
import type { AuthenticatedPrincipal } from './auth.types.js';
import { RateLimitService } from './rate-limit.service.js';
import { SupabaseAuthService } from './supabase-auth.service.js';

export interface AuthenticatedRequest extends RequestWithContext {
  user?: AuthenticatedPrincipal;
}

interface RateLimitResponse {
  setHeader(name: string, value: string): void;
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
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<RateLimitResponse>();
    const accessToken = extractBearerToken(request.header('authorization'));
    const auditContext = {
      requestId: request.requestId,
      method: request.method,
      path: getSafeRequestPath(request),
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

    let principal: AuthenticatedPrincipal;
    try {
      principal = await this.authService.verifyAccessToken(accessToken);
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

    request.user = principal;
    const rateLimit = await this.rateLimitService.consumePrincipal(principal.id);
    response.setHeader('X-RateLimit-Limit', String(rateLimit.limit));
    response.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));

    if (!rateLimit.allowed) {
      response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.auditService.record({
      eventType: 'AUTHENTICATION_SUCCESS',
      outcome: 'SUCCESS',
      actorId: principal.id,
      actorRole: principal.role,
      ...auditContext,
    });
    return true;
  }
}
