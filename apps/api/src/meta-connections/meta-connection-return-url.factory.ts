import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseMetaOAuthEnv } from '@recruitops/config';

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

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
      const secureProtocol = url.protocol === 'https:';
      const localDevelopment = url.protocol === 'http:' && isLocalhost(url.hostname);
      if ((!secureProtocol && !localDevelopment) || url.username || url.password) {
        throw new Error('META_FRONTEND_REDIRECT_URI_INVALID');
      }
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
