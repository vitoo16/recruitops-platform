import { describe, expect, it } from 'vitest';
import { canTransitionPostStatus, CreatePostSchema, PostVariantSchema } from './content.js';

describe('content contracts', () => {
  it('accepts a valid draft post', () => {
    const result = CreatePostSchema.safeParse({
      jobId: '3f568169-50ff-44f3-a191-2f376b67941b',
      title: 'Frontend Developer recruitment',
      baseContent: 'We are hiring a Frontend Developer for our product team.',
      language: 'vi',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe('DRAFT');
  });

  it('validates platform variants at the boundary', () => {
    const result = PostVariantSchema.safeParse({
      platform: 'LINKEDIN',
      text: 'We are hiring.',
      hashtags: ['hiring', 'frontend'],
      link: 'https://example.com/jobs/frontend',
    });

    expect(result.success).toBe(true);
  });

  it('prevents restoring an archived post through a silent state transition', () => {
    expect(canTransitionPostStatus('DRAFT', 'READY')).toBe(true);
    expect(canTransitionPostStatus('READY', 'DRAFT')).toBe(true);
    expect(canTransitionPostStatus('ARCHIVED', 'DRAFT')).toBe(false);
  });
});
