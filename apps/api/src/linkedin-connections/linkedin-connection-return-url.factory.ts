import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseLinkedInOAuthEnv } from '@recruitops/config';

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

@Injectable()
export class LinkedInConnectionReturnUrlFactory {
  assertConfigured(): void {
    this.baseUrl();
  }

  connected(): string {
    const url = this.baseUrl();
    url.searchParams.set('linkedinConnectionStatus', 'connected');
    return url.toString();
  }

  denied(): string {
    const url = this.baseUrl();
    url.searchParams.set('linkedinConnectionStatus', 'denied');
    return url.toString();
  }

  private baseUrl(): URL {
    try {
      const env = parseLinkedInOAuthEnv(process.env);
      const url = new URL(env.LINKEDIN_FRONTEND_REDIRECT_URI);
      const secureProtocol = url.protocol === 'https:';
      const localDevelopment = url.protocol === 'http:' && isLocalhost(url.hostname);
      if ((!secureProtocol && !localDevelopment) || url.username || url.password) {
        throw new Error('LINKEDIN_FRONTEND_REDIRECT_URI_INVALID');
      }
      url.hash = '';
      url.searchParams.delete('linkedinConnectionStatus');
      return url;
    } catch {
      throw new ServiceUnavailableException({
        code: 'LINKEDIN_OAUTH_RETURN_NOT_CONFIGURED',
        message: 'LinkedIn OAuth frontend return is not configured',
      });
    }
  }
}
