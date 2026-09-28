import { Injectable } from '@nestjs/common';
import { OAuthCredentialCipherCore, parseOAuthCredentialKeyring } from '@recruitops/integrations';

export type { OAuthCredentialPayload } from '@recruitops/contracts';
export type { EncryptedOAuthCredential, OAuthCredentialKeyring } from '@recruitops/integrations';
export { parseOAuthCredentialKeyring };

@Injectable()
export class OAuthCredentialCipher extends OAuthCredentialCipherCore {}
