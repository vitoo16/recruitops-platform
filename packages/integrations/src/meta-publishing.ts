import type {
  PublicationStatus,
  PublishCommand,
  PublishResult,
  SocialPlatform,
  SocialPublisher,
  ValidationIssue,
  ValidationResult,
} from '@recruitops/contracts';

export interface MetaPublishingConfig {
  graphApiVersion: string;
  instagramContainerPollAttempts?: number;
  instagramContainerPollIntervalMs?: number;
}

export interface MetaPublishingContext {
  platform: 'FACEBOOK' | 'INSTAGRAM';
  destinationExternalId: string;
  accessToken: string;
}

export interface MetaPublishingContextResolver {
  resolve(command: PublishCommand): Promise<MetaPublishingContext>;
}

export interface MetaPublishingMediaSource {
  mediaId: string;
  kind: 'IMAGE' | 'VIDEO';
  publicUrl: string;
}

export interface MetaPublishingMediaResolver {
  resolve(mediaIds: readonly string[]): Promise<readonly MetaPublishingMediaSource[]>;
}

export class MetaPublishingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'MetaPublishingError';
  }
}

export class MetaPublishingValidationError extends MetaPublishingError {
  constructor(public readonly issues: readonly ValidationIssue[]) {
    super('META_PUBLISH_VALIDATION_FAILED');
    this.name = 'MetaPublishingValidationError';
  }
}

interface MetaApiErrorPayload {
  error?: {
    code?: number;
  };
}

function normalizeGraphApiVersion(value: string): string {
  const normalized = value.trim();
  if (!/^v\d+\.\d+$/.test(normalized)) {
    throw new MetaPublishingError('META_GRAPH_API_VERSION_INVALID');
  }
  return normalized;
}

function requireGraphId(value: string, code: string): string {
  const normalized = value.trim();
  if (!/^\d{1,32}$/.test(normalized)) throw new MetaPublishingError(code);
  return normalized;
}

function requireAccessToken(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new MetaPublishingError('META_PUBLISH_ACCESS_TOKEN_REQUIRED');
  return normalized;
}

function requirePublicMediaUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('unsafe media url');
    return url.toString();
  } catch {
    throw new MetaPublishingError('META_PUBLISH_MEDIA_URL_INVALID');
  }
}

function composeCopy(command: PublishCommand): string {
  const sections: string[] = [];
  const text = command.payload.text.trim();
  if (text) sections.push(text);

  const hashtags = command.payload.hashtags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
  if (hashtags.length) sections.push(hashtags.join(' '));

  return sections.join('\n\n');
}

async function requestJson<T>(
  fetchFn: typeof fetch,
  url: URL,
  init: RequestInit,
  operation: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    throw new MetaPublishingError(`META_${operation}_NETWORK_ERROR`);
  }

  if (!response.ok) {
    let providerCode: number | undefined;
    try {
      const payload = (await response.json()) as MetaApiErrorPayload;
      providerCode = payload.error?.code;
    } catch {
      // Provider response bodies are intentionally not copied into RecruitOps errors.
    }
    const suffix = providerCode === undefined ? '' : `_PROVIDER_${providerCode}`;
    throw new MetaPublishingError(`META_${operation}_FAILED${suffix}`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new MetaPublishingError(`META_${operation}_RESPONSE_INVALID`, response.status);
  }
}

function parseIdResponse(input: unknown, operation: string): string {
  if (!input || typeof input !== 'object') {
    throw new MetaPublishingError(`META_${operation}_RESPONSE_INVALID`);
  }
  const id = (input as Record<string, unknown>).id;
  if (typeof id !== 'string' || !id.trim()) {
    throw new MetaPublishingError(`META_${operation}_RESPONSE_INVALID`);
  }
  return id;
}

function ensureValid(result: ValidationResult): void {
  if (!result.valid) throw new MetaPublishingValidationError(result.issues);
}

function platformIssue(expected: SocialPlatform): ValidationIssue {
  return {
    code: 'PLATFORM_MISMATCH',
    field: 'platform',
    message: `Publish command must target ${expected}`,
  };
}

function normalizeConfig(input: MetaPublishingConfig): Required<MetaPublishingConfig> {
  const attempts = input.instagramContainerPollAttempts ?? 12;
  const intervalMs = input.instagramContainerPollIntervalMs ?? 1_000;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60) {
    throw new MetaPublishingError('META_INSTAGRAM_POLL_ATTEMPTS_INVALID');
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 30_000) {
    throw new MetaPublishingError('META_INSTAGRAM_POLL_INTERVAL_INVALID');
  }
  return {
    graphApiVersion: normalizeGraphApiVersion(input.graphApiVersion),
    instagramContainerPollAttempts: attempts,
    instagramContainerPollIntervalMs: intervalMs,
  };
}

export class FacebookPagePublisher implements SocialPublisher {
  readonly platform = 'FACEBOOK' as const;
  private readonly config: Required<MetaPublishingConfig>;

  constructor(
    config: MetaPublishingConfig,
    private readonly contexts: MetaPublishingContextResolver,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.config = normalizeConfig(config);
  }

  async validate(command: PublishCommand): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    if (command.platform !== this.platform) issues.push(platformIssue(this.platform));
    if (command.payload.mediaIds?.length) {
      issues.push({
        code: 'FACEBOOK_MEDIA_NOT_SUPPORTED',
        field: 'payload.mediaIds',
        message: 'This Facebook Page adapter slice currently supports text and link posts only',
      });
    }
    if (!composeCopy(command) && !command.payload.link?.trim()) {
      issues.push({
        code: 'FACEBOOK_POST_EMPTY',
        field: 'payload',
        message: 'Facebook Page post requires text, hashtags, or a link',
      });
    }
    return { valid: issues.length === 0, issues };
  }

  async publish(command: PublishCommand): Promise<PublishResult> {
    ensureValid(await this.validate(command));
    const context = await this.contexts.resolve(command);
    if (context.platform !== this.platform) {
      throw new MetaPublishingError('META_PUBLISH_CONTEXT_PLATFORM_MISMATCH');
    }

    const pageId = requireGraphId(context.destinationExternalId, 'META_FACEBOOK_PAGE_ID_INVALID');
    const url = new URL(`https://graph.facebook.com/${this.config.graphApiVersion}/${pageId}/feed`);
    const body = new URLSearchParams();
    const message = composeCopy(command);
    if (message) body.set('message', message);
    if (command.payload.link?.trim()) body.set('link', command.payload.link.trim());

    const payload = await requestJson<unknown>(
      this.fetchFn,
      url,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${requireAccessToken(context.accessToken)}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      },
      'FACEBOOK_PAGE_PUBLISH',
    );

    return {
      status: 'PUBLISHED',
      externalPostId: parseIdResponse(payload, 'FACEBOOK_PAGE_PUBLISH'),
    };
  }

  async getStatus(_externalPostId: string): Promise<PublicationStatus> {
    return { status: 'UNKNOWN' };
  }
}

export class InstagramProfessionalPublisher implements SocialPublisher {
  readonly platform = 'INSTAGRAM' as const;
  private readonly config: Required<MetaPublishingConfig>;

  constructor(
    config: MetaPublishingConfig,
    private readonly contexts: MetaPublishingContextResolver,
    private readonly media: MetaPublishingMediaResolver,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {
    this.config = normalizeConfig(config);
  }

  async validate(command: PublishCommand): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    if (command.platform !== this.platform) issues.push(platformIssue(this.platform));
    const mediaCount = command.payload.mediaIds?.length ?? 0;
    if (mediaCount !== 1) {
      issues.push({
        code: 'INSTAGRAM_SINGLE_MEDIA_REQUIRED',
        field: 'payload.mediaIds',
        message: 'This Instagram adapter slice requires exactly one image or video',
      });
    }
    return { valid: issues.length === 0, issues };
  }

  async publish(command: PublishCommand): Promise<PublishResult> {
    ensureValid(await this.validate(command));
    const context = await this.contexts.resolve(command);
    if (context.platform !== this.platform) {
      throw new MetaPublishingError('META_PUBLISH_CONTEXT_PLATFORM_MISMATCH');
    }

    const igUserId = requireGraphId(
      context.destinationExternalId,
      'META_INSTAGRAM_ACCOUNT_ID_INVALID',
    );
    const token = requireAccessToken(context.accessToken);
    const mediaIds = command.payload.mediaIds!;
    const sources = await this.media.resolve(mediaIds);
    if (sources.length !== 1 || sources[0]?.mediaId !== mediaIds[0]) {
      throw new MetaPublishingError('META_INSTAGRAM_MEDIA_RESOLUTION_MISMATCH');
    }

    const source = sources[0];
    const mediaUrl = requirePublicMediaUrl(source.publicUrl);
    const createUrl = new URL(
      `https://graph.facebook.com/${this.config.graphApiVersion}/${igUserId}/media`,
    );
    const createBody = new URLSearchParams();
    if (source.kind === 'IMAGE') {
      createBody.set('image_url', mediaUrl);
    } else {
      createBody.set('media_type', 'REELS');
      createBody.set('video_url', mediaUrl);
      createBody.set('share_to_feed', 'true');
    }
    const caption = composeCopy(command);
    if (caption) createBody.set('caption', caption);

    const createPayload = await requestJson<unknown>(
      this.fetchFn,
      createUrl,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: createBody,
      },
      'INSTAGRAM_CONTAINER_CREATE',
    );
    const containerId = parseIdResponse(createPayload, 'INSTAGRAM_CONTAINER_CREATE');

    if (source.kind === 'VIDEO') {
      await this.waitForContainer(containerId, token);
    }

    const publishUrl = new URL(
      `https://graph.facebook.com/${this.config.graphApiVersion}/${igUserId}/media_publish`,
    );
    const publishPayload = await requestJson<unknown>(
      this.fetchFn,
      publishUrl,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ creation_id: containerId }),
      },
      'INSTAGRAM_MEDIA_PUBLISH',
    );

    return {
      status: 'PUBLISHED',
      externalPostId: parseIdResponse(publishPayload, 'INSTAGRAM_MEDIA_PUBLISH'),
      providerRequestId: containerId,
    };
  }

  async getStatus(_externalPostId: string): Promise<PublicationStatus> {
    return { status: 'UNKNOWN' };
  }

  private async waitForContainer(containerId: string, token: string): Promise<void> {
    const id = requireGraphId(containerId, 'META_INSTAGRAM_CONTAINER_ID_INVALID');

    for (let attempt = 0; attempt < this.config.instagramContainerPollAttempts; attempt += 1) {
      const url = new URL(`https://graph.facebook.com/${this.config.graphApiVersion}/${id}`);
      url.searchParams.set('fields', 'status_code,status');
      const payload = await requestJson<{ status_code?: unknown }>(
        this.fetchFn,
        url,
        { headers: { authorization: `Bearer ${token}` } },
        'INSTAGRAM_CONTAINER_STATUS',
      );

      if (payload.status_code === 'FINISHED') return;
      if (payload.status_code === 'ERROR' || payload.status_code === 'EXPIRED') {
        throw new MetaPublishingError(`META_INSTAGRAM_CONTAINER_${payload.status_code}`);
      }
      if (attempt + 1 < this.config.instagramContainerPollAttempts) {
        await this.sleep(this.config.instagramContainerPollIntervalMs);
      }
    }

    throw new MetaPublishingError('META_INSTAGRAM_CONTAINER_TIMEOUT');
  }
}
