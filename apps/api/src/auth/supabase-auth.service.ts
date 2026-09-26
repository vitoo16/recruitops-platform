import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { parseSupabaseAuthEnv } from '@recruitops/config';
import { APP_ROLES, type AppRole, type AuthenticatedPrincipal } from './auth.types.js';

interface SupabaseUserPayload {
  id: string;
  email: string | null;
  appMetadata: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSupabaseUser(value: unknown): SupabaseUserPayload | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null;
  }

  const email = value.email === null || typeof value.email === 'string' ? value.email : null;
  const appMetadata = isRecord(value.app_metadata) ? value.app_metadata : {};

  return { id: value.id, email, appMetadata };
}

function parseRole(value: unknown): AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value)
    ? (value as AppRole)
    : 'VIEWER';
}

@Injectable()
export class SupabaseAuthService {
  async verifyAccessToken(accessToken: string): Promise<AuthenticatedPrincipal> {
    let authEnv;

    try {
      authEnv = parseSupabaseAuthEnv(process.env);
    } catch {
      throw new ServiceUnavailableException('Authentication provider is not configured.');
    }

    let response: Response;

    try {
      response = await fetch(`${authEnv.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
        method: 'GET',
        headers: {
          apikey: authEnv.SUPABASE_PUBLISHABLE_KEY,
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ServiceUnavailableException('Authentication provider is temporarily unavailable.');
    }

    if (!response.ok) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    const payload: unknown = await response.json();
    const user = parseSupabaseUser(payload);

    if (!user) {
      throw new UnauthorizedException('Authentication provider returned an invalid user payload.');
    }

    return {
      id: user.id,
      email: user.email,
      role: parseRole(user.appMetadata.recruitops_role),
    };
  }
}
