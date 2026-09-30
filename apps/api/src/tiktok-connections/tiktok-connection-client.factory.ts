import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseTikTokOAuthEnv } from '@recruitops/config';
import { TikTokConnectionProvider } from '@recruitops/integrations';

@Injectable()
export class TikTokConnectionClientFactory {
  create(): TikTokConnectionProvider {
    try {
      const env = parseTikTokOAuthEnv(process.env);
      return new TikTokConnectionProvider({
        clientKey: env.TIKTOK_CLIENT_KEY,
        clientSecret: env.TIKTOK_CLIENT_SECRET,
        redirectUri: env.TIKTOK_REDIRECT_URI,
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'TIKTOK_OAUTH_NOT_CONFIGURED',
        message: 'TikTok OAuth is not configured',
      });
    }
  }
}
