export const tikTokPrivacyLevels = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
] as const;

export type TikTokPrivacyLevel = (typeof tikTokPrivacyLevels)[number];

export interface TikTokCreatorInfo {
  creatorUsername: string;
  creatorNickname: string;
  privacyLevelOptions: readonly TikTokPrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSeconds: number;
}

export interface TikTokDirectPostVideoInput {
  title?: string | undefined;
  privacyLevel: TikTokPrivacyLevel;
  disableComment?: boolean | undefined;
  disableDuet?: boolean | undefined;
  disableStitch?: boolean | undefined;
  brandContentToggle?: boolean | undefined;
  brandOrganicToggle?: boolean | undefined;
  isAigc?: boolean | undefined;
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
}

export interface TikTokDirectPostInitialization {
  publishId: string;
  uploadUrl: string;
}

export interface TikTokPostStatus {
  status:
    | 'PROCESSING_UPLOAD'
    | 'PROCESSING_DOWNLOAD'
    | 'SEND_TO_USER_INBOX'
    | 'PUBLISH_COMPLETE'
    | 'FAILED';
  failureReason?: string | undefined;
  publiclyAvailablePostIds: readonly string[];
  uploadedBytes?: number | undefined;
}

export class TikTokPublishingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = 'TikTokPublishingError';
  }
}

interface TikTokEnvelope {
  data?: unknown;
  error?: {
    code?: unknown;
  };
}

function requiredToken(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TikTokPublishingError('TIKTOK_PUBLISH_ACCESS_TOKEN_REQUIRED');
  }
  return normalized;
}

function requiredPublishId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 64) {
    throw new TikTokPublishingError('TIKTOK_PUBLISH_ID_INVALID');
  }
  return normalized;
}

function requirePrivacyLevel(value: string): TikTokPrivacyLevel {
  if (!tikTokPrivacyLevels.includes(value as TikTokPrivacyLevel)) {
    throw new TikTokPublishingError('TIKTOK_PRIVACY_LEVEL_INVALID');
  }
  return value as TikTokPrivacyLevel;
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TikTokPublishingError(code);
  }
  return value;
}

function requireUploadUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TikTokPublishingError('TIKTOK_UPLOAD_URL_INVALID');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.hostname !== 'open-upload.tiktokapis.com' && !url.hostname.endsWith('.tiktokapis.com'))
  ) {
    throw new TikTokPublishingError('TIKTOK_UPLOAD_URL_INVALID');
  }
  return url.toString();
}

function requireVideoContentType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(normalized)) {
    throw new TikTokPublishingError('TIKTOK_VIDEO_CONTENT_TYPE_UNSUPPORTED');
  }
  return normalized;
}

async function requestEnvelope(
  fetchFn: typeof fetch,
  url: URL,
  init: RequestInit,
  operation: string,
): Promise<TikTokEnvelope> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    throw new TikTokPublishingError(`TIKTOK_${operation}_NETWORK_ERROR`);
  }

  let payload: TikTokEnvelope;
  try {
    payload = (await response.json()) as TikTokEnvelope;
  } catch {
    throw new TikTokPublishingError(`TIKTOK_${operation}_RESPONSE_INVALID`, response.status);
  }

  const providerCode = typeof payload.error?.code === 'string' ? payload.error.code : undefined;
  if (!response.ok || providerCode !== 'ok') {
    const suffix = providerCode ? `_PROVIDER_${providerCode.toUpperCase()}` : '';
    throw new TikTokPublishingError(`TIKTOK_${operation}_FAILED${suffix}`, response.status);
  }
  return payload;
}

function objectData(payload: TikTokEnvelope, operation: string): Record<string, unknown> {
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    throw new TikTokPublishingError(`TIKTOK_${operation}_RESPONSE_INVALID`);
  }
  return payload.data as Record<string, unknown>;
}

function parseCreatorInfo(payload: TikTokEnvelope): TikTokCreatorInfo {
  const data = objectData(payload, 'CREATOR_INFO');
  const privacy = data.privacy_level_options;
  if (
    typeof data.creator_username !== 'string' ||
    typeof data.creator_nickname !== 'string' ||
    !Array.isArray(privacy) ||
    privacy.length === 0 ||
    typeof data.comment_disabled !== 'boolean' ||
    typeof data.duet_disabled !== 'boolean' ||
    typeof data.stitch_disabled !== 'boolean' ||
    typeof data.max_video_post_duration_sec !== 'number' ||
    !Number.isFinite(data.max_video_post_duration_sec) ||
    data.max_video_post_duration_sec <= 0
  ) {
    throw new TikTokPublishingError('TIKTOK_CREATOR_INFO_RESPONSE_INVALID');
  }

  const privacyLevelOptions = privacy.map((item) => {
    if (typeof item !== 'string') {
      throw new TikTokPublishingError('TIKTOK_CREATOR_INFO_RESPONSE_INVALID');
    }
    return requirePrivacyLevel(item);
  });

  return {
    creatorUsername: data.creator_username,
    creatorNickname: data.creator_nickname,
    privacyLevelOptions,
    commentDisabled: data.comment_disabled,
    duetDisabled: data.duet_disabled,
    stitchDisabled: data.stitch_disabled,
    maxVideoPostDurationSeconds: data.max_video_post_duration_sec,
  };
}

function parseInitialization(payload: TikTokEnvelope): TikTokDirectPostInitialization {
  const data = objectData(payload, 'VIDEO_INIT');
  if (typeof data.publish_id !== 'string' || typeof data.upload_url !== 'string') {
    throw new TikTokPublishingError('TIKTOK_VIDEO_INIT_RESPONSE_INVALID');
  }
  return {
    publishId: requiredPublishId(data.publish_id),
    uploadUrl: requireUploadUrl(data.upload_url),
  };
}

function parseStatus(payload: TikTokEnvelope): TikTokPostStatus {
  const data = objectData(payload, 'STATUS');
  const allowedStatuses = [
    'PROCESSING_UPLOAD',
    'PROCESSING_DOWNLOAD',
    'SEND_TO_USER_INBOX',
    'PUBLISH_COMPLETE',
    'FAILED',
  ] as const;
  if (
    typeof data.status !== 'string' ||
    !allowedStatuses.includes(data.status as (typeof allowedStatuses)[number])
  ) {
    throw new TikTokPublishingError('TIKTOK_STATUS_RESPONSE_INVALID');
  }

  const ids = data.publicaly_available_post_id;
  const publiclyAvailablePostIds = Array.isArray(ids)
    ? ids.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    : [];

  return {
    status: data.status as TikTokPostStatus['status'],
    ...(typeof data.fail_reason === 'string' && data.fail_reason
      ? { failureReason: data.fail_reason.slice(0, 160) }
      : {}),
    publiclyAvailablePostIds,
    ...(typeof data.uploaded_bytes === 'number' && Number.isFinite(data.uploaded_bytes)
      ? { uploadedBytes: data.uploaded_bytes }
      : {}),
  };
}

export class TikTokPublishingProvider {
  constructor(private readonly fetchFn: typeof fetch = fetch) {}

  async queryCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
    const payload = await requestEnvelope(
      this.fetchFn,
      new URL('https://open.tiktokapis.com/v2/post/publish/creator_info/query/'),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${requiredToken(accessToken)}`,
          'content-type': 'application/json; charset=UTF-8',
        },
      },
      'CREATOR_INFO',
    );
    return parseCreatorInfo(payload);
  }

  async initializeVideoDirectPost(
    accessToken: string,
    input: TikTokDirectPostVideoInput,
  ): Promise<TikTokDirectPostInitialization> {
    const videoSize = requirePositiveInteger(input.videoSize, 'TIKTOK_VIDEO_SIZE_INVALID');
    const chunkSize = requirePositiveInteger(input.chunkSize, 'TIKTOK_CHUNK_SIZE_INVALID');
    const totalChunkCount = requirePositiveInteger(
      input.totalChunkCount,
      'TIKTOK_CHUNK_COUNT_INVALID',
    );
    if (chunkSize > videoSize || totalChunkCount > 1_000) {
      throw new TikTokPublishingError('TIKTOK_UPLOAD_CHUNK_CONFIGURATION_INVALID');
    }
    const title = input.title?.trim();
    if (title && title.length > 2_200) {
      throw new TikTokPublishingError('TIKTOK_TITLE_TOO_LONG');
    }

    const payload = await requestEnvelope(
      this.fetchFn,
      new URL('https://open.tiktokapis.com/v2/post/publish/video/init/'),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${requiredToken(accessToken)}`,
          'content-type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            ...(title ? { title } : {}),
            privacy_level: requirePrivacyLevel(input.privacyLevel),
            ...(input.disableComment !== undefined
              ? { disable_comment: input.disableComment }
              : {}),
            ...(input.disableDuet !== undefined ? { disable_duet: input.disableDuet } : {}),
            ...(input.disableStitch !== undefined ? { disable_stitch: input.disableStitch } : {}),
            brand_content_toggle: input.brandContentToggle ?? false,
            brand_organic_toggle: input.brandOrganicToggle ?? false,
            ...(input.isAigc !== undefined ? { is_aigc: input.isAigc } : {}),
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: videoSize,
            chunk_size: chunkSize,
            total_chunk_count: totalChunkCount,
          },
        }),
      },
      'VIDEO_INIT',
    );
    return parseInitialization(payload);
  }

  async uploadVideoChunk(input: {
    uploadUrl: string;
    contentType: string;
    bytes: Uint8Array;
    firstByte: number;
    totalSize: number;
  }): Promise<void> {
    const uploadUrl = requireUploadUrl(input.uploadUrl);
    const totalSize = requirePositiveInteger(input.totalSize, 'TIKTOK_VIDEO_SIZE_INVALID');
    if (
      !Number.isSafeInteger(input.firstByte) ||
      input.firstByte < 0 ||
      input.bytes.byteLength < 1
    ) {
      throw new TikTokPublishingError('TIKTOK_UPLOAD_RANGE_INVALID');
    }
    const lastByte = input.firstByte + input.bytes.byteLength - 1;
    if (lastByte >= totalSize) {
      throw new TikTokPublishingError('TIKTOK_UPLOAD_RANGE_INVALID');
    }

    let response: Response;
    try {
      response = await this.fetchFn(uploadUrl, {
        method: 'PUT',
        headers: {
          'content-type': requireVideoContentType(input.contentType),
          'content-length': String(input.bytes.byteLength),
          'content-range': `bytes ${input.firstByte}-${lastByte}/${totalSize}`,
        },
        body: input.bytes as BodyInit,
      });
    } catch {
      throw new TikTokPublishingError('TIKTOK_VIDEO_UPLOAD_NETWORK_ERROR');
    }
    if (!response.ok) {
      throw new TikTokPublishingError('TIKTOK_VIDEO_UPLOAD_FAILED', response.status);
    }
  }

  async getPostStatus(accessToken: string, publishId: string): Promise<TikTokPostStatus> {
    const payload = await requestEnvelope(
      this.fetchFn,
      new URL('https://open.tiktokapis.com/v2/post/publish/status/fetch/'),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${requiredToken(accessToken)}`,
          'content-type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ publish_id: requiredPublishId(publishId) }),
      },
      'STATUS',
    );
    return parseStatus(payload);
  }
}
