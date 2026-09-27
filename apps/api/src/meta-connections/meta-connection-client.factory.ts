import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseMetaOAuthEnv } from '@recruitops/config';
import { MetaConnectionProvider } from '@recruitops/integrations';

@Injectable()
export class MetaConnectionClientFactory {
  create(): MetaConnectionProvider {
    let env;
    try {
      env = parseMetaOAuthEnv(process.env);
    } catch {
      throw new ServiceUnavailableException({
        code: 'META_OAUTH_NOT_CONFIGURED',
        message: 'Meta OAuth connection is not configured',
      });
    }

    return new MetaConnectionProvider({
      appId: env.META_CLIENT_ID,
      appSecret: env.META_CLIENT_SECRET,
      graphApiVersion: env.META_GRAPH_API_VERSION,
      redirectUri: env.META_REDIRECT_URI,
    });
  }
}
