import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from './auth.types.js';
import { SupabaseAuthService } from './supabase-auth.service.js';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedPrincipal;
}

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || null;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: SupabaseAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = extractBearerToken(request.header('authorization'));

    if (!accessToken) {
      throw new UnauthorizedException('Bearer access token is required.');
    }

    request.user = await this.authService.verifyAccessToken(accessToken);
    return true;
  }
}
