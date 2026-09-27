import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseMetaOAuthEnv } from '@recruitops/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_ISSUER = 'recruitops-meta-oauth';

const MetaOAuthStatePayloadSchema = z.object({
  version: z.literal(1),
  issuer: z.literal(STATE_ISSUER),
  actorId: z.uuid(),
  nonce: z.string().min(16).max(128),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});

export interface IssuedMetaOAuthState {
  state: string;
  expiresAt: string;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload, 'utf8').digest();
}

export function issueMetaOAuthState(
  actorId: string,
  secret: string,
  nowMs = Date.now(),
): IssuedMetaOAuthState {
  const payload = MetaOAuthStatePayloadSchema.parse({
    version: 1,
    issuer: STATE_ISSUER,
    actorId,
    nonce: randomBytes(18).toString('base64url'),
    issuedAt: nowMs,
    expiresAt: nowMs + STATE_TTL_MS,
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const encodedSignature = signature(encodedPayload, secret).toString('base64url');

  return {
    state: `${encodedPayload}.${encodedSignature}`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export function verifyMetaOAuthState(
  state: string,
  secret: string,
  nowMs = Date.now(),
): { actorId: string } {
  if (state.length > 4096) throw new Error('META_OAUTH_STATE_INVALID');
  const [encodedPayload, encodedSignature, extra] = state.split('.');
  if (!encodedPayload || !encodedSignature || extra) throw new Error('META_OAUTH_STATE_INVALID');

  const expected = signature(encodedPayload, secret);
  let received: Buffer;
  try {
    received = Buffer.from(encodedSignature, 'base64url');
  } catch {
    throw new Error('META_OAUTH_STATE_INVALID');
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error('META_OAUTH_STATE_INVALID');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('META_OAUTH_STATE_INVALID');
  }
  const payload = MetaOAuthStatePayloadSchema.safeParse(parsed);
  if (!payload.success) throw new Error('META_OAUTH_STATE_INVALID');
  if (payload.data.expiresAt <= nowMs || payload.data.issuedAt > nowMs + 30_000) {
    throw new Error('META_OAUTH_STATE_EXPIRED');
  }

  return { actorId: payload.data.actorId };
}

@Injectable()
export class MetaOAuthStateService {
  issue(actorId: string): IssuedMetaOAuthState {
    return issueMetaOAuthState(actorId, this.stateSecret());
  }

  verify(state: string): { actorId: string } {
    try {
      return verifyMetaOAuthState(state, this.stateSecret());
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const code = error instanceof Error ? error.message : 'META_OAUTH_STATE_INVALID';
      throw new BadRequestException({
        code,
        message: 'Meta OAuth state is invalid or expired',
      });
    }
  }

  private stateSecret(): string {
    try {
      return parseMetaOAuthEnv(process.env).META_OAUTH_STATE_SECRET;
    } catch {
      throw new ServiceUnavailableException({
        code: 'META_OAUTH_NOT_CONFIGURED',
        message: 'Meta OAuth connection is not configured',
      });
    }
  }
}
