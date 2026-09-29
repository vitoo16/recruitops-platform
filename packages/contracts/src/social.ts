import { z } from 'zod';
import { SocialPlatformSchema, type SocialPlatform } from './content.js';

export const destinationTypeValues = [
  'PAGE',
  'PROFILE',
  'GROUP',
  'ORGANIZATION',
  'OA',
  'OTHER',
] as const;
export const postingModeValues = ['API', 'MANUAL'] as const;
export const socialAccountStatusValues = ['CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR'] as const;
export const manualDistributionChecklistValues = [
  'OPEN_DESTINATION',
  'ATTACH_MEDIA',
  'PASTE_CONTENT',
  'REVIEW_CONTENT',
  'PUBLISH_MANUALLY',
  'CONFIRM_PUBLICATION',
] as const;

export const DestinationTypeSchema = z.enum(destinationTypeValues);
export const PostingModeSchema = z.enum(postingModeValues);
export const SocialAccountStatusSchema = z.enum(socialAccountStatusValues);
export const ManualDistributionChecklistSchema = z.enum(manualDistributionChecklistValues);

const normalizedTagsSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(30)
  .default([])
  .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]);

export const DestinationSchema = z.object({
  id: z.uuid(),
  platform: SocialPlatformSchema,
  type: DestinationTypeSchema,
  name: z.string().trim().min(1).max(160),
  externalId: z.string().trim().min(1).max(255).optional(),
  url: z.url().optional(),
  postingMode: PostingModeSchema,
  enabled: z.boolean().default(true),
  tags: normalizedTagsSchema,
  socialAccountId: z.uuid().optional(),
});

export const DestinationFilterSchema = z.object({
  platform: SocialPlatformSchema.optional(),
  postingMode: PostingModeSchema.optional(),
  enabled: z.boolean().optional(),
  tags: normalizedTagsSchema.optional(),
  search: z.string().trim().max(160).optional(),
});

export const SocialAccountSchema = z.object({
  id: z.uuid(),
  platform: SocialPlatformSchema,
  externalAccountId: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(160),
  status: SocialAccountStatusSchema,
  scopes: z.array(z.string().trim().min(1).max(255)).max(100).default([]),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});

export type Destination = z.infer<typeof DestinationSchema>;
export type DestinationFilter = z.input<typeof DestinationFilterSchema>;
export type SocialAccount = z.infer<typeof SocialAccountSchema>;
export type DestinationType = z.infer<typeof DestinationTypeSchema>;
export type PostingMode = z.infer<typeof PostingModeSchema>;
export type SocialAccountStatus = z.infer<typeof SocialAccountStatusSchema>;
export type ManualDistributionChecklistCode = z.infer<typeof ManualDistributionChecklistSchema>;

export function matchesDestinationFilter(
  destination: Destination,
  rawFilter: DestinationFilter,
): boolean {
  const parsed = DestinationFilterSchema.safeParse(rawFilter);
  if (!parsed.success) return false;

  const filter = parsed.data;
  if (filter.platform && destination.platform !== filter.platform) return false;
  if (filter.postingMode && destination.postingMode !== filter.postingMode) return false;
  if (filter.enabled !== undefined && destination.enabled !== filter.enabled) return false;

  if (filter.tags?.length) {
    const destinationTags = new Set(destination.tags);
    if (!filter.tags.every((tag) => destinationTags.has(tag))) return false;
  }

  if (filter.search) {
    const needle = filter.search.toLowerCase();
    const haystack = `${destination.name} ${destination.url ?? ''}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

export interface SocialPostPayload {
  text: string;
  hashtags: readonly string[];
  link?: string | undefined;
  mediaIds?: readonly string[] | undefined;
  metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface PublishCommand {
  platform: SocialPlatform;
  socialAccountId: string;
  destinationId: string;
  idempotencyKey: string;
  correlationId?: string | undefined;
  payload: SocialPostPayload;
}

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string | undefined;
}

export interface ValidationResult {
  valid: boolean;
  issues: readonly ValidationIssue[];
}

export interface PublishResult {
  status: 'PUBLISHED' | 'PROCESSING';
  externalPostId?: string | undefined;
  externalUrl?: string | undefined;
  providerRequestId?: string | undefined;
}

export interface PublicationStatus {
  status: 'PROCESSING' | 'PUBLISHED' | 'FAILED' | 'UNKNOWN';
  externalPostId?: string | undefined;
  externalUrl?: string | undefined;
  failureCode?: string | undefined;
  failureMessage?: string | undefined;
}

export interface SocialPublisher {
  readonly platform: SocialPlatform;
  validate(command: PublishCommand): Promise<ValidationResult>;
  publish(command: PublishCommand): Promise<PublishResult>;
  getStatus(externalPostId: string): Promise<PublicationStatus>;
}

export interface ManualDistributionInstruction {
  destinationId: string;
  destinationUrl?: string | undefined;
  copyText: string;
  checklist: readonly ManualDistributionChecklistCode[];
}

export interface ManualDistributionProvider {
  prepare(command: PublishCommand): Promise<ManualDistributionInstruction>;
}
