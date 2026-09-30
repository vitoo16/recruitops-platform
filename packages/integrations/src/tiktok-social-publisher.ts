import type {
  PublicationStatus,
  PublishCommand,
  PublishResult,
  SocialPublisher,
  ValidationIssue,
  ValidationResult,
} from '@recruitops/contracts';
import {
  TikTokPublishingError,
  TikTokPublishingProvider,
  type TikTokCreatorInfo,
  type TikTokPrivacyLevel,
} from './tiktok-publishing.js';

const DEFAULT_MAX_VIDEO_BYTES = 20 * 1024 * 1024;

export interface TikTokPublishingContext {
  platform: 'TIKTOK';
  accessToken: string;
}

export interface TikTokPublishingContextResolver {
  resolve(command: PublishCommand): Promise<TikTokPublishingContext>;
}

export interface TikTokPublishingMediaSource {
  mediaId: string;
  kind: 'IMAGE' | 'VIDEO';
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
}

export interface TikTokPublishingMediaResolver {
  resolve(mediaIds: readonly string[]): Promise<readonly TikTokPublishingMediaSource[]>;
}

export interface TikTokDirectPostPublisherConfig {
  maxVideoBytes?: number | undefined;
}

interface TikTokVariantSettings {
  consentConfirmed: true;
  privacyLevel: TikTokPrivacyLevel;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  brandContentToggle?: boolean | undefined;
  brandOrganicToggle?: boolean | undefined;
  isAigc?: boolean | undefined;
}

export class TikTokSocialPublisherError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'TikTokSocialPublisherError';
  }
}

export class TikTokSocialPublisherValidationError extends TikTokSocialPublisherError {
  constructor(public readonly issues: readonly ValidationIssue[]) {
    super('TIKTOK_PUBLISH_VALIDATION_FAILED');
    this.name = 'TikTokSocialPublisherValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  return typeof value === 'boolean' ? value : undefined;
}

function parseSettings(command: PublishCommand): TikTokVariantSettings | undefined {
  const metadata = command.payload.metadata;
  const raw = isRecord(metadata) ? metadata.tiktok : undefined;
  if (!isRecord(raw) || raw.consentConfirmed !== true) return undefined;

  const privacyLevel = raw.privacyLevel;
  const disableComment = raw.disableComment;
  const disableDuet = raw.disableDuet;
  const disableStitch = raw.disableStitch;
  if (
    typeof privacyLevel !== 'string' ||
    !['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'].includes(
      privacyLevel,
    ) ||
    typeof disableComment !== 'boolean' ||
    typeof disableDuet !== 'boolean' ||
    typeof disableStitch !== 'boolean'
  ) {
    return undefined;
  }

  const brandContentToggle = optionalBoolean(raw, 'brandContentToggle');
  const brandOrganicToggle = optionalBoolean(raw, 'brandOrganicToggle');
  const isAigc = optionalBoolean(raw, 'isAigc');
  if (
    (raw.brandContentToggle !== undefined && brandContentToggle === undefined) ||
    (raw.brandOrganicToggle !== undefined && brandOrganicToggle === undefined) ||
    (raw.isAigc !== undefined && isAigc === undefined)
  ) {
    return undefined;
  }

  return {
    consentConfirmed: true,
    privacyLevel: privacyLevel as TikTokPrivacyLevel,
    disableComment,
    disableDuet,
    disableStitch,
    ...(brandContentToggle !== undefined ? { brandContentToggle } : {}),
    ...(brandOrganicToggle !== undefined ? { brandOrganicToggle } : {}),
    ...(isAigc !== undefined ? { isAigc } : {}),
  };
}

function composeTitle(command: PublishCommand): string {
  const parts: string[] = [];
  const text = command.payload.text.trim();
  if (text) parts.push(text);
  const hashtags = command.payload.hashtags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));
  if (hashtags.length > 0) parts.push(hashtags.join(' '));
  return parts.join('\n\n');
}

function requireHttpsMediaUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TikTokSocialPublisherError('TIKTOK_MEDIA_URL_INVALID');
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) {
    throw new TikTokSocialPublisherError('TIKTOK_MEDIA_URL_INVALID');
  }
  return url.toString();
}

function requirePositiveSafeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TikTokSocialPublisherError(code);
  }
  return value;
}

function ensureCreatorSettings(
  creator: TikTokCreatorInfo,
  settings: TikTokVariantSettings,
): void {
  if (!creator.privacyLevelOptions.includes(settings.privacyLevel)) {
    throw new TikTokSocialPublisherError('TIKTOK_PRIVACY_LEVEL_UNAVAILABLE');
  }
  if (creator.commentDisabled && !settings.disableComment) {
    throw new TikTokSocialPublisherError('TIKTOK_COMMENTS_DISABLED_BY_CREATOR');
  }
  if (creator.duetDisabled && !settings.disableDuet) {
    throw new TikTokSocialPublisherError('TIKTOK_DUET_DISABLED_BY_CREATOR');
  }
  if (creator.stitchDisabled && !settings.disableStitch) {
    throw new TikTokSocialPublisherError('TIKTOK_STITCH_DISABLED_BY_CREATOR');
  }
}

export class TikTokDirectPostPublisher implements SocialPublisher {
  readonly platform = 'TIKTOK' as const;
  private readonly maxVideoBytes: number;

  constructor(
    private readonly contexts: TikTokPublishingContextResolver,
    private readonly media: TikTokPublishingMediaResolver,
    private readonly provider: TikTokPublishingProvider = new TikTokPublishingProvider(),
    private readonly fetchFn: typeof fetch = fetch,
    config: TikTokDirectPostPublisherConfig = {},
  ) {
    this.maxVideoBytes = requirePositiveSafeInteger(
      config.maxVideoBytes ?? DEFAULT_MAX_VIDEO_BYTES,
      'TIKTOK_MAX_VIDEO_BYTES_INVALID',
    );
  }

  async validate(command: PublishCommand): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    if (command.platform !== this.platform) {
      issues.push({
        code: 'PLATFORM_MISMATCH',
        field: 'platform',
        message: 'Publish command must target TIKTOK',
      });
    }

    const mediaIds = command.payload.mediaIds ?? [];
    if (mediaIds.length !== 1) {
      issues.push({
        code: 'TIKTOK_SINGLE_VIDEO_REQUIRED',
        field: 'payload.mediaIds',
        message: 'TikTok direct posting currently requires exactly one video',
      });
    }
    if (command.payload.link?.trim()) {
      issues.push({
        code: 'TIKTOK_LINK_NOT_SUPPORTED',
        field: 'payload.link',
        message: 'TikTok direct posting does not map RecruitOps link metadata in this slice',
      });
    }

    const title = composeTitle(command);
    if (title.length > 2_200) {
      issues.push({
        code: 'TIKTOK_TITLE_TOO_LONG',
        field: 'payload.text',
        message: 'TikTok caption must be at most 2200 UTF-16 code units',
      });
    }

    if (!parseSettings(command)) {
      issues.push({
        code: 'TIKTOK_EXPLICIT_SETTINGS_REQUIRED',
        field: 'payload.metadata.tiktok',
        message: 'TikTok requires explicit consent, privacy and interaction settings',
      });
    }

    return { valid: issues.length === 0, issues };
  }

  async publish(command: PublishCommand): Promise<PublishResult> {
    const validation = await this.validate(command);
    if (!validation.valid) {
      throw new TikTokSocialPublisherValidationError(validation.issues);
    }

    const settings = parseSettings(command);
    if (!settings) {
      throw new TikTokSocialPublisherError('TIKTOK_EXPLICIT_SETTINGS_REQUIRED');
    }
    const context = await this.contexts.resolve(command);
    if (context.platform !== this.platform || !context.accessToken.trim()) {
      throw new TikTokSocialPublisherError('TIKTOK_PUBLISH_CONTEXT_INVALID');
    }

    const sources = await this.media.resolve(command.payload.mediaIds ?? []);
    if (sources.length !== 1 || sources[0]?.kind !== 'VIDEO') {
      throw new TikTokSocialPublisherError('TIKTOK_VIDEO_MEDIA_REQUIRED');
    }
    const source = sources[0];
    const sizeBytes = requirePositiveSafeInteger(source.sizeBytes, 'TIKTOK_VIDEO_SIZE_INVALID');
    if (sizeBytes > this.maxVideoBytes) {
      throw new TikTokSocialPublisherError('TIKTOK_VIDEO_SIZE_LIMIT_EXCEEDED');
    }
    if (source.mimeType.trim().toLowerCase() !== 'video/mp4') {
      throw new TikTokSocialPublisherError('TIKTOK_VIDEO_CONTENT_TYPE_UNSUPPORTED');
    }

    const creator = await this.provider.queryCreatorInfo(context.accessToken);
    ensureCreatorSettings(creator, settings);

    let mediaResponse: Response;
    try {
      mediaResponse = await this.fetchFn(requireHttpsMediaUrl(source.publicUrl), {
        method: 'GET',
        headers: { accept: 'video/mp4' },
      });
    } catch {
      throw new TikTokSocialPublisherError('TIKTOK_MEDIA_DOWNLOAD_NETWORK_ERROR');
    }
    if (!mediaResponse.ok) {
      throw new TikTokSocialPublisherError('TIKTOK_MEDIA_DOWNLOAD_FAILED');
    }

    const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
    if (bytes.byteLength !== sizeBytes || bytes.byteLength > this.maxVideoBytes) {
      throw new TikTokSocialPublisherError('TIKTOK_MEDIA_SIZE_MISMATCH');
    }

    const initialization = await this.provider.initializeVideoDirectPost(context.accessToken, {
      title: composeTitle(command),
      privacyLevel: settings.privacyLevel,
      disableComment: settings.disableComment,
      disableDuet: settings.disableDuet,
      disableStitch: settings.disableStitch,
      ...(settings.brandContentToggle !== undefined
        ? { brandContentToggle: settings.brandContentToggle }
        : {}),
      ...(settings.brandOrganicToggle !== undefined
        ? { brandOrganicToggle: settings.brandOrganicToggle }
        : {}),
      ...(settings.isAigc !== undefined ? { isAigc: settings.isAigc } : {}),
      videoSize: sizeBytes,
      chunkSize: sizeBytes,
      totalChunkCount: 1,
    });

    await this.provider.uploadVideoChunk({
      uploadUrl: initialization.uploadUrl,
      contentType: source.mimeType,
      bytes,
      firstByte: 0,
      totalSize: sizeBytes,
    });

    return {
      status: 'PROCESSING',
      externalPostId: initialization.publishId,
    };
  }

  async getStatus(_externalPostId: string): Promise<PublicationStatus> {
    return { status: 'UNKNOWN' };
  }
}

export function isTikTokPublishingError(error: unknown): error is TikTokPublishingError {
  return error instanceof TikTokPublishingError;
}
