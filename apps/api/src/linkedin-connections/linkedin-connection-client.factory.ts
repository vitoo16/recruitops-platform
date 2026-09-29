import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseLinkedInOAuthEnv } from '@recruitops/config';
import { LinkedInConnectionProvider } from '@recruitops/integrations';

@Injectable()
export class LinkedInConnectionClientFactory {
  create(): LinkedInConnectionProvider {
    try {
      const env = parseLinkedInOAuthEnv(process.env);
      return new LinkedInConnectionProvider({
        clientId: env.LINKEDIN_CLIENT_ID,
        clientSecret: env.LINKEDIN_CLIENT_SECRET,
        redirectUri: env.LINKEDIN_REDIRECT_URI,
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'LINKEDIN_OAUTH_NOT_CONFIGURED',
        message: 'LinkedIn OAuth is not configured',
      });
    }
  }
}
