import { Injectable } from '@nestjs/common';
import { OAuthCredentialCipher as SharedOAuthCredentialCipher } from '@recruitops/integrations';

export {
  parseOAuthCredentialKeyring,
  type EncryptedOAuthCredential,
  type OAuthCredentialKeyring,
  type OAuthCredentialPayload,
} from '@recruitops/integrations';

@Injectable()
export class OAuthCredentialCipher extends SharedOAuthCredentialCipher {}
