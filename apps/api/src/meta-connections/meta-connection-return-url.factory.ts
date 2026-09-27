import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseMetaOAuthEnv } from '@recruitops/config';

@Injectable()
export class MetaConnectionReturnUrlFactory {
  assertConfigured(): void {
    this.baseUrl();
  }

  success(connectionSessionId: string): string {
    const url = this.baseUrl();
    url.searchParams.set('metaConnectionStatus', 'ready');
    url.searchParams.set('metaConnectionSession', connectionSessionId);
    return url.toString();
  }

  denied(): string {
    const url = this.baseUrl();
    url.searchParams.set('metaConnectionStatus', 'denied');
    url.searchParams.delete('metaConnectionSession');
    return url.toString();
  }

  private baseUrl(): URL {
    try {
      const env = parseMetaOAuthEnv(process.env);
      const url = new URL(env.META_FRONTEND_REDIRECT_URI);
      url.hash = '';
      return url;
    } catch {
      throw new ServiceUnavailableException({
        code: 'META_OAUTH_RETURN_NOT_CONFIGURED',
        message: 'Meta OAuth frontend return is not configured',
      });
    }
  }
}
