import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseMetaOAuthEnv } from '@recruitops/config';
import {
  MetaOAuthClient,
  type MetaManagedPage,
  type MetaOAuthClientConfig,
  type MetaTokenResult,
} from '@recruitops/integrations';

@Injectable()
export class MetaProviderService {
  authorizationUrl(state: string): string {
    return this.client().buildAuthorizationUrl(state);
  }

  exchangeCode(code: string): Promise<MetaTokenResult> {
    return this.client().exchangeAuthorizationCode(code);
  }

  grantedPermissions(accessToken: string): Promise<string[]> {
    return this.client().getGrantedPermissions(accessToken);
  }

  managedPages(accessToken: string): Promise<MetaManagedPage[]> {
    return this.client().getManagedPages(accessToken);
  }

  private client(): MetaOAuthClient {
    try {
      const env = parseMetaOAuthEnv(process.env);
      const config: MetaOAuthClientConfig = {
        appId: env.META_CLIENT_ID,
        appSecret: env.META_CLIENT_SECRET,
        loginConfigId: env.META_LOGIN_CONFIG_ID,
        redirectUri: env.META_REDIRECT_URI,
        graphApiVersion: env.META_GRAPH_API_VERSION,
      };
      return new MetaOAuthClient(config);
    } catch {
      throw new ServiceUnavailableException({
        code: 'META_OAUTH_NOT_CONFIGURED',
        message: 'Meta OAuth connection is not configured',
      });
    }
  }
}
