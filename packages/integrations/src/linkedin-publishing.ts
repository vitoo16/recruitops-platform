import type {
  PublicationStatus,
  PublishCommand,
  PublishResult,
  SocialPublisher,
  ValidationIssue,
  ValidationResult,
} from '@recruitops/contracts';

export interface LinkedInPublishingConfig {
  apiVersion: string;
}

export interface LinkedInPublishingContext {
  platform: 'LINKEDIN';
  authorUrn: string;
  accessToken: string;
}

export interface LinkedInPublishingContextResolver {
  resolve(command: PublishCommand): Promise<LinkedInPublishingContext>;
}

export class LinkedInPublishingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'LinkedInPublishingError';
  }
}

export class LinkedInPublishingValidationError extends LinkedInPublishingError {
  constructor(public readonly issues: readonly ValidationIssue[]) {
    super('LINKEDIN_PUBLISH_VALIDATION_FAILED');
    this.name = 'LinkedInPublishingValidationError';
  }
}

function normalizeApiVersion(value: string): string {
  const normalized = value.trim();
  if (!/^\d{6}$/.test(normalized)) {
    throw new LinkedInPublishingError('LINKEDIN_API_VERSION_INVALID');
  }
  return normalized;
}

function requireAccessToken(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new LinkedInPublishingError('LINKEDIN_PUBLISH_ACCESS_TOKEN_REQUIRED');
  return normalized;
}

function requireAuthorUrn(value: string): string {
  const normalized = value.trim();
  if (!/^urn:li:person:[A-Za-z0-9_-]{1,255}$/.test(normalized)) {
    throw new LinkedInPublishingError('LINKEDIN_PUBLISH_AUTHOR_URN_INVALID');
  }
  return normalized;
}

function composeCommentary(command: PublishCommand): string {
  const sections: string[] = [];
  const text = command.payload.text.trim();
  if (text) sections.push(text);

  const hashtags = command.payload.hashtags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
  if (hashtags.length) sections.push(hashtags.join(' '));

  const link = command.payload.link?.trim();
  if (link) sections.push(link);

  return sections.join('\n\n');
}

function ensureValid(result: ValidationResult): void {
  if (!result.valid) throw new LinkedInPublishingValidationError(result.issues);
}

export class LinkedInMemberPublisher implements SocialPublisher {
  readonly platform = 'LINKEDIN' as const;
  private readonly apiVersion: string;

  constructor(
    config: LinkedInPublishingConfig,
    private readonly contexts: LinkedInPublishingContextResolver,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.apiVersion = normalizeApiVersion(config.apiVersion);
  }

  async validate(command: PublishCommand): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    if (command.platform !== this.platform) {
      issues.push({
        code: 'PLATFORM_MISMATCH',
        field: 'platform',
        message: 'Publish command must target LINKEDIN',
      });
    }

    if ((command.payload.mediaIds ?? []).length > 0) {
      issues.push({
        code: 'LINKEDIN_MEDIA_NOT_SUPPORTED',
        field: 'payload.mediaIds',
        message: 'This LinkedIn member publishing slice supports text, hashtags and links only',
      });
    }

    const commentary = composeCommentary(command);
    if (!commentary) {
      issues.push({
        code: 'LINKEDIN_POST_EMPTY',
        field: 'payload',
        message: 'LinkedIn post requires text, hashtags or a link',
      });
    } else if (commentary.length > 3_000) {
      issues.push({
        code: 'LINKEDIN_COMMENTARY_TOO_LONG',
        field: 'payload',
        message: 'LinkedIn post commentary must be at most 3000 characters',
      });
    }

    return { valid: issues.length === 0, issues };
  }

  async publish(command: PublishCommand): Promise<PublishResult> {
    ensureValid(await this.validate(command));
    const context = await this.contexts.resolve(command);
    if (context.platform !== this.platform) {
      throw new LinkedInPublishingError('LINKEDIN_PUBLISH_CONTEXT_PLATFORM_MISMATCH');
    }

    const response = await this.fetchFn('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${requireAccessToken(context.accessToken)}`,
        'content-type': 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'linkedin-version': this.apiVersion,
      },
      body: JSON.stringify({
        author: requireAuthorUrn(context.authorUrn),
        commentary: composeCommentary(command),
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    }).catch(() => {
      throw new LinkedInPublishingError('LINKEDIN_CREATE_POST_NETWORK_ERROR');
    });

    if (!response.ok) {
      throw new LinkedInPublishingError('LINKEDIN_CREATE_POST_FAILED', response.status);
    }

    const externalPostId = response.headers.get('x-restli-id')?.trim();
    if (!externalPostId || !/^urn:li:(?:share|ugcPost):[A-Za-z0-9_-]+$/.test(externalPostId)) {
      throw new LinkedInPublishingError('LINKEDIN_CREATE_POST_RESPONSE_INVALID', response.status);
    }

    return {
      status: 'PUBLISHED',
      externalPostId,
      ...(response.headers.get('x-restli-request-id')
        ? { providerRequestId: response.headers.get('x-restli-request-id') ?? undefined }
        : {}),
    };
  }

  async getStatus(_externalPostId: string): Promise<PublicationStatus> {
    return { status: 'UNKNOWN' };
  }
}
