import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseTikTokOAuthEnv } from '@recruitops/config';

@Injectable()
export class TikTokConnectionReturnUrlFactory {
  assertConfigured(): void {
    this.baseUrl();
  }

  connected(): string {
    const url = this.baseUrl();
    url.searchParams.set('tiktokConnectionStatus', 'connected');
    return url.toString();
  }

  denied(): string {
    const url = this.baseUrl();
    url.searchParams.set('tiktokConnectionStatus', 'denied');
    return url.toString();
  }

  private baseUrl(): URL {
    try {
      const env = parseTikTokOAuthEnv(process.env);
      const url = new URL(env.TIKTOK_FRONTEND_REDIRECT_URI);
      const local =
        url.protocol === 'http:' &&
        (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
      if ((url.protocol !== 'https:' && !local) || url.username || url.password) throw new Error();
      url.hash = '';
      url.searchParams.delete('tiktokConnectionStatus');
      return url;
    } catch {
      throw new ServiceUnavailableException({
        code: 'TIKTOK_OAUTH_RETURN_NOT_CONFIGURED',
        message: 'TikTok OAuth frontend return is not configured',
      });
    }
  }
}
