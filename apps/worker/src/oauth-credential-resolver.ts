import type { SocialPlatform } from '@recruitops/contracts';
import type { PrismaClient } from '@recruitops/database';
import { OAuthCredentialCipher } from '@recruitops/integrations';

export class WorkerOAuthCredentialResolver {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher = new OAuthCredentialCipher(),
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolveAccessToken(
    socialAccountId: string,
    expectedPlatform: SocialPlatform,
  ): Promise<string> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { id: socialAccountId },
      select: {
        platform: true,
        status: true,
        expiresAt: true,
        credential: {
          select: {
            platform: true,
            keyId: true,
            algorithm: true,
            iv: true,
            authTag: true,
            ciphertext: true,
          },
        },
      },
    });

    if (!account) throw new Error('PUBLICATION_SOCIAL_ACCOUNT_NOT_FOUND');
    if (account.platform !== expectedPlatform) {
      throw new Error('PUBLICATION_SOCIAL_ACCOUNT_PLATFORM_MISMATCH');
    }
    if (account.status !== 'CONNECTED') {
      throw new Error('PUBLICATION_SOCIAL_ACCOUNT_NOT_CONNECTED');
    }
    if (account.expiresAt && account.expiresAt.getTime() <= this.now().getTime()) {
      throw new Error('PUBLICATION_SOCIAL_ACCOUNT_EXPIRED');
    }

    const credential = account.credential;
    if (!credential) throw new Error('PUBLICATION_SOCIAL_CREDENTIAL_MISSING');
    if (credential.platform !== expectedPlatform) {
      throw new Error('PUBLICATION_SOCIAL_CREDENTIAL_PLATFORM_MISMATCH');
    }

    const payload = this.cipher.decrypt(
      {
        platform: credential.platform,
        keyId: credential.keyId,
        algorithm: credential.algorithm as 'aes-256-gcm',
        iv: credential.iv,
        authTag: credential.authTag,
        ciphertext: credential.ciphertext,
      },
      this.env,
    );

    if (payload.expiresAt && Date.parse(payload.expiresAt) <= this.now().getTime()) {
      throw new Error('PUBLICATION_SOCIAL_CREDENTIAL_EXPIRED');
    }

    return payload.accessToken;
  }
}
