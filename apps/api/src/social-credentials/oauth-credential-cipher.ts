import { Injectable } from '@nestjs/common';
import {
  OAuthCredentialCipher as SharedOAuthCredentialCipher,
  parseOAuthCredentialKeyring,
  type EncryptedOAuthCredential,
  type OAuthCredentialKeyring,
  type OAuthCredentialPayload,
} from '@recruitops/integrations';

export {
  parseOAuthCredentialKeyring,
  type EncryptedOAuthCredential,
  type OAuthCredentialKeyring,
  type OAuthCredentialPayload,
};

@Injectable()
export class OAuthCredentialCipher extends SharedOAuthCredentialCipher {}
