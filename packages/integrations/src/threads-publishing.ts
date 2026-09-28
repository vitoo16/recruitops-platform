import type {
  PublicationStatus,
  PublishCommand,
  PublishResult,
  SocialPublisher,
  ValidationIssue,
  ValidationResult,
} from '@recruitops/contracts';

export interface ThreadsPublishingContext {
  platform: 'THREADS';
  accessToken: string;
}

export interface ThreadsPublishingContextResolver {
  resolve(command: PublishCommand): Promise<ThreadsPublishingContext>;
}

export interface ThreadsPublishingMediaSource {
  mediaId: string;
  kind: 'IMAGE' | 'VIDEO';
  publicUrl: string;
}

export interface ThreadsPublishingMediaResolver {
  resolve(mediaIds: readonly string[]): Promise<readonly ThreadsPublishingMediaSource[]>;
}

export class ThreadsPublishingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'ThreadsPublishingError';
  }
}

export class ThreadsPublishingValidationError extends ThreadsPublishingError {
  constructor(public readonly issues: readonly ValidationIssue[]) {
    super('THREADS_PUBLISH_VALIDATION_FAILED');
    this.name = 'ThreadsPublishingValidationError';
  }
}

interface ThreadsApiErrorPayload {
  error?: {
    code?: number;
  };
}

const THREADS_API_HOST = 'https://graph.threads.net';

function requireAccessToken(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ThreadsPublishingError('THREADS_PUBLISH_ACCESS_TOKEN_REQUIRED');
  return normalized;
}

function requirePublicMediaUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('unsafe media url');
    }
    return url.toString();
  } catch {
    throw new ThreadsPublishingError('THREADS_PUBLISH_MEDIA_URL_INVALID');
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

  const link = command.payload.link?.trim();
  if (link) sections.push(link);

  return sections.join('\n\n');
}

function optionalAltText(command: PublishCommand): string | undefined {
  const altText = command.payload.metadata?.altText;
  if (typeof altText !== 'string') return undefined;
  const normalized = altText.trim();
  return normalized || undefined;
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
    throw new ThreadsPublishingError(`THREADS_${operation}_NETWORK_ERROR`);
  }

  if (!response.ok) {
    let providerCode: number | undefined;
    try {
      const payload = (await response.json()) as ThreadsApiErrorPayload;
      providerCode = payload.error?.code;
    } catch {
      // Provider response bodies are intentionally not copied into RecruitOps errors.
    }
    const suffix = providerCode === undefined ? '' : `_PROVIDER_${providerCode}`;
    throw new ThreadsPublishingError(`THREADS_${operation}_FAILED${suffix}`, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ThreadsPublishingError(`THREADS_${operation}_RESPONSE_INVALID`, response.status);
  }
}

function parseIdResponse(input: unknown, operation: string): string {
  if (!input || typeof input !== 'object') {
    throw new ThreadsPublishingError(`THREADS_${operation}_RESPONSE_INVALID`);
  }
  const id = (input as Record<string, unknown>).id;
  if (typeof id !== 'string' || !id.trim()) {
    throw new ThreadsPublishingError(`THREADS_${operation}_RESPONSE_INVALID`);
  }
  return id;
}

function ensureValid(result: ValidationResult): void {
  if (!result.valid) throw new ThreadsPublishingValidationError(result.issues);
}

export class ThreadsPublisher implements SocialPublisher {
  readonly platform = 'THREADS' as const;

  constructor(
    private readonly contexts: ThreadsPublishingContextResolver,
    private readonly media: ThreadsPublishingMediaResolver,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async validate(command: PublishCommand): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    if (command.platform !== this.platform) {
      issues.push({
        code: 'PLATFORM_MISMATCH',
        field: 'platform',
        message: 'Publish command must target THREADS',
      });
    }

    const mediaIds = command.payload.mediaIds ?? [];
    if (mediaIds.length > 1) {
      issues.push({
        code: 'THREADS_SINGLE_POST_MEDIA_LIMIT',
        field: 'payload.mediaIds',
        message: 'This Threads adapter slice supports at most one image or video per post',
      });
    }

    if (!composeCopy(command) && mediaIds.length === 0) {
      issues.push({
        code: 'THREADS_POST_EMPTY',
        field: 'payload',
        message: 'Threads post requires text, hashtags, a link, or one media item',
      });
    }

    return { valid: issues.length === 0, issues };
  }

  async publish(command: PublishCommand): Promise<PublishResult> {
    ensureValid(await this.validate(command));
    const context = await this.contexts.resolve(command);
    if (context.platform !== this.platform) {
      throw new ThreadsPublishingError('THREADS_PUBLISH_CONTEXT_PLATFORM_MISMATCH');
    }

    const accessToken = requireAccessToken(context.accessToken);
    const mediaIds = command.payload.mediaIds ?? [];
    const resolvedMedia = mediaIds.length ? await this.media.resolve(mediaIds) : [];
    if (resolvedMedia.length !== mediaIds.length) {
      throw new ThreadsPublishingError('THREADS_PUBLISH_MEDIA_RESOLUTION_INCOMPLETE');
    }

    const createUrl = new URL(`${THREADS_API_HOST}/me/threads`);
    const createBody = new URLSearchParams();
    const copy = composeCopy(command);
    if (copy) createBody.set('text', copy);

    if (resolvedMedia.length === 0) {
      createBody.set('media_type', 'TEXT');
    } else {
      const source = resolvedMedia[0]!;
      const publicUrl = requirePublicMediaUrl(source.publicUrl);
      createBody.set('media_type', source.kind);
      if (source.kind === 'IMAGE') createBody.set('image_url', publicUrl);
      else createBody.set('video_url', publicUrl);
      const altText = optionalAltText(command);
      if (altText) createBody.set('alt_text', altText);
    }

    const createPayload = await requestJson<unknown>(
      this.fetchFn,
      createUrl,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: createBody,
      },
      'CREATE_CONTAINER',
    );
    const creationId = parseIdResponse(createPayload, 'CREATE_CONTAINER');

    const publishUrl = new URL(`${THREADS_API_HOST}/me/threads_publish`);
    const publishBody = new URLSearchParams({ creation_id: creationId });
    const publishPayload = await requestJson<unknown>(
      this.fetchFn,
      publishUrl,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: publishBody,
      },
      'PUBLISH_CONTAINER',
    );

    return {
      status: 'PUBLISHED',
      externalPostId: parseIdResponse(publishPayload, 'PUBLISH_CONTAINER'),
    };
  }

  async getStatus(_externalPostId: string): Promise<PublicationStatus> {
    return { status: 'UNKNOWN' };
  }
}
