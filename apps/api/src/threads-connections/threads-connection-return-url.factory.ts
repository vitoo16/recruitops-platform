import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseThreadsOAuthEnv } from '@recruitops/config';

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

@Injectable()
export class ThreadsConnectionReturnUrlFactory {
  assertConfigured(): void {
    this.baseUrl();
  }

  connected(): string {
    const url = this.baseUrl();
    url.searchParams.set('threadsConnectionStatus', 'connected');
    return url.toString();
  }

  denied(): string {
    const url = this.baseUrl();
    url.searchParams.set('threadsConnectionStatus', 'denied');
    return url.toString();
  }

  private baseUrl(): URL {
    try {
      const env = parseThreadsOAuthEnv(process.env);
      const url = new URL(env.THREADS_FRONTEND_REDIRECT_URI);
      const secureProtocol = url.protocol === 'https:';
      const localDevelopment = url.protocol === 'http:' && isLocalhost(url.hostname);
      if ((!secureProtocol && !localDevelopment) || url.username || url.password) {
        throw new Error('THREADS_FRONTEND_REDIRECT_URI_INVALID');
      }
      url.hash = '';
      url.searchParams.delete('threadsConnectionStatus');
      return url;
    } catch {
      throw new ServiceUnavailableException({
        code: 'THREADS_OAUTH_RETURN_NOT_CONFIGURED',
        message: 'Threads OAuth frontend return is not configured',
      });
    }
  }
}
