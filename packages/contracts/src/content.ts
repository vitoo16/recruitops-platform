import { z } from 'zod';

export const postStatusValues = ['DRAFT', 'READY', 'ARCHIVED'] as const;
export const socialPlatformValues = [
  'FACEBOOK',
  'INSTAGRAM',
  'THREADS',
  'LINKEDIN',
  'TIKTOK',
  'ZALO',
] as const;
export const contentLanguageValues = ['vi', 'en'] as const;

export const PostStatusSchema = z.enum(postStatusValues);
export const SocialPlatformSchema = z.enum(socialPlatformValues);
export const ContentLanguageSchema = z.enum(contentLanguageValues);

export const CreatePostSchema = z.object({
  jobId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  baseContent: z.string().trim().min(1).max(20_000),
  language: ContentLanguageSchema,
  status: PostStatusSchema.default('DRAFT'),
});

export const PostVariantSchema = z.object({
  platform: SocialPlatformSchema,
  text: z.string().trim().min(1).max(10_000),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  link: z.url().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const allowedPostTransitions: Readonly<
  Record<(typeof postStatusValues)[number], readonly (typeof postStatusValues)[number][]>
> = {
  DRAFT: ['READY', 'ARCHIVED'],
  READY: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionPostStatus(
  from: (typeof postStatusValues)[number],
  to: (typeof postStatusValues)[number],
): boolean {
  return from === to || allowedPostTransitions[from].includes(to);
}

export type PostStatus = z.infer<typeof PostStatusSchema>;
export type SocialPlatform = z.infer<typeof SocialPlatformSchema>;
export type ContentLanguage = z.infer<typeof ContentLanguageSchema>;
export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type PostVariantInput = z.infer<typeof PostVariantSchema>;
