import {
  OAuthCredentialPayloadSchema,
  type OAuthCredentialPayload,
  type SocialPlatform,
} from '@recruitops/contracts';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm' as const;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const AAD_VERSION = 'recruitops:oauth-credential:v1';

export interface EncryptedOAuthCredential {
  platform: SocialPlatform;
  keyId: string;
  algorithm: typeof ALGORITHM;
  iv: Uint8Array;
  authTag: Uint8Array;
  ciphertext: Uint8Array;
}

export interface OAuthCredentialKeyring {
  activeKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}

function invalidConfiguration(code: string): Error {
  return new Error(code);
}

function decodeEncryptionKey(value: string): Buffer {
  const normalized = value.trim();
  if (!normalized) throw invalidConfiguration('OAUTH_CREDENTIAL_ENCRYPTION_KEY_INVALID');

  const decoded = Buffer.from(normalized, 'base64');
  const canonical = decoded.toString('base64').replace(/=+$/, '');
  if (canonical !== normalized.replace(/=+$/, '') || decoded.length !== KEY_BYTES) {
    throw invalidConfiguration('OAUTH_CREDENTIAL_ENCRYPTION_KEY_INVALID');
  }

  return decoded;
}

export function parseOAuthCredentialKeyring(
  env: NodeJS.ProcessEnv = process.env,
): OAuthCredentialKeyring {
  const activeKeyId = env.OAUTH_CREDENTIAL_ACTIVE_KEY_ID?.trim();
  const rawKeyring = env.OAUTH_CREDENTIAL_ENCRYPTION_KEYS?.trim();
  if (!activeKeyId || !rawKeyring) {
    throw invalidConfiguration('OAUTH_CREDENTIAL_ENCRYPTION_NOT_CONFIGURED');
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(activeKeyId)) {
    throw invalidConfiguration('OAUTH_CREDENTIAL_ACTIVE_KEY_ID_INVALID');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawKeyring);
  } catch {
    throw invalidConfiguration('OAUTH_CREDENTIAL_ENCRYPTION_KEYS_INVALID');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidConfiguration('OAUTH_CREDENTIAL_ENCRYPTION_KEYS_INVALID');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 8) {
    throw invalidConfiguration('OAUTH_CREDENTIAL_ENCRYPTION_KEYS_INVALID');
  }

  const keys = new Map<string, Buffer>();
  for (const [keyId, value] of entries) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId) || typeof value !== 'string') {
      throw invalidConfiguration('OAUTH_CREDENTIAL_ENCRYPTION_KEYS_INVALID');
    }
    keys.set(keyId, decodeEncryptionKey(value));
  }

  if (!keys.has(activeKeyId)) {
    throw invalidConfiguration('OAUTH_CREDENTIAL_ACTIVE_KEY_NOT_FOUND');
  }

  return { activeKeyId, keys };
}

function buildAdditionalAuthenticatedData(platform: SocialPlatform, keyId: string): Buffer {
  return Buffer.from(`${AAD_VERSION}:${platform}:${keyId}`, 'utf8');
}

export class OAuthCredentialCipherCore {
  encrypt(
    platform: SocialPlatform,
    input: OAuthCredentialPayload,
    env: NodeJS.ProcessEnv = process.env,
  ): EncryptedOAuthCredential {
    const payload = OAuthCredentialPayloadSchema.parse(input);
    const keyring = parseOAuthCredentialKeyring(env);
    const key = keyring.keys.get(keyring.activeKeyId);
    if (!key) throw invalidConfiguration('OAUTH_CREDENTIAL_ACTIVE_KEY_NOT_FOUND');

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
    cipher.setAAD(buildAdditionalAuthenticatedData(platform, keyring.activeKeyId));

    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      platform,
      keyId: keyring.activeKeyId,
      algorithm: ALGORITHM,
      iv,
      authTag,
      ciphertext,
    };
  }

  decrypt(
    encrypted: EncryptedOAuthCredential,
    env: NodeJS.ProcessEnv = process.env,
  ): OAuthCredentialPayload {
    if (encrypted.algorithm !== ALGORITHM) {
      throw new Error('OAUTH_CREDENTIAL_ALGORITHM_UNSUPPORTED');
    }
    if (encrypted.iv.byteLength !== IV_BYTES || encrypted.authTag.byteLength !== AUTH_TAG_BYTES) {
      throw new Error('OAUTH_CREDENTIAL_ENVELOPE_INVALID');
    }

    const keyring = parseOAuthCredentialKeyring(env);
    const key = keyring.keys.get(encrypted.keyId);
    if (!key) throw new Error('OAUTH_CREDENTIAL_KEY_NOT_AVAILABLE');

    try {
      const decipher = createDecipheriv(ALGORITHM, key, encrypted.iv, {
        authTagLength: AUTH_TAG_BYTES,
      });
      decipher.setAAD(buildAdditionalAuthenticatedData(encrypted.platform, encrypted.keyId));
      decipher.setAuthTag(encrypted.authTag);
      const plaintext = Buffer.concat([
        decipher.update(encrypted.ciphertext),
        decipher.final(),
      ]).toString('utf8');
      return OAuthCredentialPayloadSchema.parse(JSON.parse(plaintext));
    } catch {
      throw new Error('OAUTH_CREDENTIAL_DECRYPTION_FAILED');
    }
  }
}
