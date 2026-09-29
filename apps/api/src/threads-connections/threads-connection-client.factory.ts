import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseThreadsOAuthEnv } from '@recruitops/config';
import { ThreadsConnectionProvider } from '@recruitops/integrations';

@Injectable()
export class ThreadsConnectionClientFactory {
  create(): ThreadsConnectionProvider {
    try {
      const env = parseThreadsOAuthEnv(process.env);
      return new ThreadsConnectionProvider({
        appId: env.THREADS_CLIENT_ID,
        appSecret: env.THREADS_CLIENT_SECRET,
        redirectUri: env.THREADS_REDIRECT_URI,
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'THREADS_OAUTH_NOT_CONFIGURED',
        message: 'Threads OAuth is not configured',
      });
    }
  }
}
