'use client';

import type { Job, Post } from '@recruitops/contracts';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ContentStudioPostForm } from './use-content-studio';

interface PostDraftPanelProps {
  jobs: Job[];
  posts: Post[];
  postId: string;
  loadingPosts: boolean;
  canMutate: boolean;
  form: UseFormReturn<ContentStudioPostForm>;
  onPostChange(postId: string): void;
  onCreateDraft(values: ContentStudioPostForm): Promise<void>;
}

export function PostDraftPanel({
  jobs,
  posts,
  postId,
  loadingPosts,
  canMutate,
  form,
  onPostChange,
  onCreateDraft,
}: PostDraftPanelProps) {
  const t = useTranslations('contentMedia');

  return (
    <section className="rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-panel)]">
      <label className="text-sm font-medium" htmlFor="content-job">
        {t('job')}
      </label>
      <select
        id="content-job"
        className="mt-2 h-11 w-full rounded-md border bg-[var(--surface-panel)] px-3 text-sm"
        {...form.register('jobId')}
      >
        <option value="">{t('chooseJob')}</option>
        {jobs.map((job) => (
          <option key={job.id} value={job.id}>
            {job.title} · {job.companyName}
          </option>
        ))}
      </select>

      {canMutate ? (
        <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(onCreateDraft)} noValidate>
          <div className="flex items-center gap-2">
            <Plus className="size-4" aria-hidden="true" />
            <h3 className="font-semibold text-pretty">{t('createDraft')}</h3>
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="content-title">
              {t('postTitle')}
            </label>
            <Input
              id="content-title"
              autoComplete="off"
              required
              {...form.register('title')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="content-body">
              {t('baseContent')}
            </label>
            <textarea
              id="content-body"
              className="mt-1 min-h-32 w-full rounded-md border bg-[var(--surface-panel)] px-3 py-2 text-sm leading-6"
              autoComplete="off"
              required
              {...form.register('baseContent')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium" htmlFor="content-language">
              {t('language')}
            </label>
            <select
              id="content-language"
              className="mt-1 h-11 w-full rounded-md border bg-[var(--surface-panel)] px-3 text-sm"
              {...form.register('language')}
            >
              <option value="vi">{t('languageVi')}</option>
              <option value="en">{t('languageEn')}</option>
            </select>
          </div>
          <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t('saving') : t('createAction')}
          </Button>
        </form>
      ) : (
        <p className="mt-6 text-sm text-[var(--content-secondary)]">{t('readOnly')}</p>
      )}

      <div className="mt-6 border-t pt-6">
        <label className="text-sm font-medium" htmlFor="content-post">
          {t('post')}
        </label>
        <select
          id="content-post"
          className="mt-2 h-11 w-full rounded-md border bg-[var(--surface-panel)] px-3 text-sm"
          value={postId}
          disabled={loadingPosts}
          onChange={(event) => onPostChange(event.target.value)}
        >
          <option value="">{loadingPosts ? t('loadingPosts') : t('choosePost')}</option>
          {posts.map((post) => (
            <option key={post.id} value={post.id}>
              {post.title}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
