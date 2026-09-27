'use client';

import type { Session } from '@supabase/supabase-js';
import {
  CreatePostSchema,
  PrivateFileUploadIntentSchema,
  RegisterMediaAssetSchema,
  type Job,
  type MediaAsset,
  type Post,
  type PrivateFileUploadPolicy,
} from '@recruitops/contracts';
import { FileImage, Plus, RefreshCw, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ContentApiError, createPost, listPosts } from '@/lib/content/api';
import { FilesApiError, listMediaAssets, registerMediaAsset } from '@/lib/files/api';
import { listJobs } from '@/lib/jobs/api';
import { PrivateFileAccessError, uploadPrivateFile } from '@/lib/storage/private-files';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const PrincipalSchema = z.object({
  id: z.string().min(1),
  email: z.email().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']),
});

type Role = z.infer<typeof PrincipalSchema>['role'];
type PostForm = {
  jobId: string;
  title: string;
  baseContent: string;
  language: 'vi' | 'en';
};

const MEDIA_UPLOAD_POLICY: PrivateFileUploadPolicy = {
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
  maxBytes: 20 * 1024 * 1024,
};

function apiUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? null;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function ContentMediaWorkspace() {
  const t = useTranslations('contentMedia');
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postId, setPostId] = useState('');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configuredApiUrl = useMemo(apiUrl, []);
  const canMutate = role === 'OWNER' || role === 'ADMIN' || role === 'RECRUITER';
  const form = useForm<PostForm>({
    defaultValues: { jobId: '', title: '', baseContent: '', language: 'vi' },
  });
  const selectedJobId = form.watch('jobId');

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setRole(null);
        setJobs([]);
        setPosts([]);
        setAssets([]);
        setPostId('');
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token || !configuredApiUrl) return;
    let active = true;

    void Promise.all([
      fetch(`${configuredApiUrl}/auth/me`, {
        headers: { authorization: `Bearer ${session.access_token}` },
      }).then(async (response) => {
        if (!response.ok) throw new Error('principal_failed');
        return PrincipalSchema.parse(await response.json());
      }),
      listJobs(configuredApiUrl, session.access_token),
    ])
      .then(([principal, jobResponse]) => {
        if (!active) return;
        setRole(principal.role);
        setJobs(jobResponse.items);
        const firstJob = jobResponse.items[0]?.id ?? '';
        if (firstJob) form.setValue('jobId', firstJob);
      })
      .catch(() => {
        if (active) setError(t('loadFailed'));
      });

    return () => {
      active = false;
    };
  }, [configuredApiUrl, form, session, t]);

  async function loadPostsForJob(jobId: string) {
    if (!session?.access_token || !configuredApiUrl || !jobId) {
      setPosts([]);
      setPostId('');
      return;
    }
    setLoadingPosts(true);
    setError(null);
    try {
      const response = await listPosts(configuredApiUrl, session.access_token, jobId);
      setPosts(response.items);
      setPostId((current) => {
        if (response.items.some((post) => post.id === current)) return current;
        return response.items[0]?.id ?? '';
      });
    } catch {
      setPosts([]);
      setPostId('');
      setError(t('loadFailed'));
    } finally {
      setLoadingPosts(false);
    }
  }

  useEffect(() => {
    if (selectedJobId) void loadPostsForJob(selectedJobId);
    // Reload only when the selected job changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId, session?.access_token, configuredApiUrl]);

  async function loadAssets(nextPostId = postId) {
    if (!session?.access_token || !configuredApiUrl || !nextPostId) {
      setAssets([]);
      return;
    }
    setLoadingAssets(true);
    setError(null);
    try {
      setAssets(await listMediaAssets(configuredApiUrl, session.access_token, nextPostId));
    } catch {
      setAssets([]);
      setError(t('mediaLoadFailed'));
    } finally {
      setLoadingAssets(false);
    }
  }

  useEffect(() => {
    if (postId) void loadAssets(postId);
    else setAssets([]);
    // Reload only when the selected post changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, session?.access_token, configuredApiUrl]);

  async function onCreateDraft(values: PostForm) {
    if (!session?.access_token || !configuredApiUrl || !canMutate) return;
    setError(null);
    const parsed = CreatePostSchema.safeParse(values);
    if (!parsed.success) {
      setError(t('invalidDraft'));
      return;
    }

    try {
      const created = await createPost(configuredApiUrl, session.access_token, parsed.data);
      await loadPostsForJob(created.jobId);
      setPostId(created.id);
      form.setValue('title', '');
      form.setValue('baseContent', '');
    } catch (caught) {
      setError(
        caught instanceof ContentApiError && caught.status === 403
          ? t('forbidden')
          : t('saveFailed'),
      );
    }
  }

  async function uploadMedia() {
    if (!session?.access_token || !configuredApiUrl || !postId || !file || !canMutate) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError(t('storageUnavailable'));
      return;
    }

    const objectId = crypto.randomUUID();
    const intent = PrivateFileUploadIntentSchema.safeParse({
      purpose: 'CONTENT_MEDIA',
      ownerUserId: session.user.id,
      ownerEntityId: postId,
      objectId,
      originalFileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!intent.success) {
      setError(t('invalidMedia'));
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadPrivateFile({
        client: supabase,
        intent: intent.data,
        policy: MEDIA_UPLOAD_POLICY,
        file,
      });
      const registration = RegisterMediaAssetSchema.parse({
        postId,
        kind: file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
        storageKey: uploaded.objectKey,
        originalFileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        altText: altText.trim() || undefined,
      });
      await registerMediaAsset(configuredApiUrl, session.access_token, registration);
      setFile(null);
      setAltText('');
      const input = document.getElementById('content-media-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await loadAssets(postId);
    } catch (caught) {
      if (caught instanceof PrivateFileAccessError) {
        setError(
          caught.message.includes('MIME_TYPE_NOT_ALLOWED') ||
            caught.message.includes('FILE_TOO_LARGE')
            ? t('invalidMedia')
            : t('uploadFailed'),
        );
      } else if (caught instanceof FilesApiError && caught.status === 403) {
        setError(t('forbidden'));
      } else {
        setError(t('uploadFailed'));
      }
    } finally {
      setUploading(false);
    }
  }

  if (!configuredApiUrl) {
    return <p className="text-sm text-amber-700">{t('missingApiConfig')}</p>;
  }
  if (!session) {
    return <p className="text-sm text-neutral-500">{t('signInRequired')}</p>;
  }

  return (
    <section className="space-y-6" aria-labelledby="content-media-title">
      <div>
        <p className="text-sm font-medium text-neutral-500">{t('eyebrow')}</p>
        <h2 id="content-media-title" className="mt-1 text-2xl font-semibold tracking-tight">
          {t('title')}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">{t('description')}</p>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border bg-white p-6">
            <label className="text-sm font-medium" htmlFor="content-job">
              {t('job')}
            </label>
            <select
              id="content-job"
              className="mt-2 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
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
              <form
                className="mt-5 space-y-4"
                onSubmit={form.handleSubmit(onCreateDraft)}
                noValidate
              >
                <div className="flex items-center gap-2">
                  <Plus className="size-4" aria-hidden="true" />
                  <h3 className="font-semibold">{t('createDraft')}</h3>
                </div>
                <label className="block text-sm font-medium" htmlFor="content-title">
                  {t('postTitle')}
                </label>
                <Input id="content-title" required {...form.register('title')} />
                <label className="block text-sm font-medium" htmlFor="content-body">
                  {t('baseContent')}
                </label>
                <textarea
                  id="content-body"
                  className="min-h-32 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
                  required
                  {...form.register('baseContent')}
                />
                <label className="block text-sm font-medium" htmlFor="content-language">
                  {t('language')}
                </label>
                <select
                  id="content-language"
                  className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                  {...form.register('language')}
                >
                  <option value="vi">{t('languageVi')}</option>
                  <option value="en">{t('languageEn')}</option>
                </select>
                <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? t('saving') : t('createAction')}
                </Button>
              </form>
            ) : (
              <p className="mt-5 text-sm text-neutral-600">{t('readOnly')}</p>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <label className="text-sm font-medium" htmlFor="content-post">
                  {t('post')}
                </label>
                <select
                  id="content-post"
                  className="mt-2 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
                  value={postId}
                  disabled={loadingPosts}
                  onChange={(event) => setPostId(event.target.value)}
                >
                  <option value="">{loadingPosts ? t('loadingPosts') : t('choosePost')}</option>
                  {posts.map((post) => (
                    <option key={post.id} value={post.id}>
                      {post.title}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!postId || loadingAssets}
                onClick={() => void loadAssets()}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                <span className="sr-only">{t('refreshMedia')}</span>
              </Button>
            </div>

            {canMutate ? (
              <div className="mt-5 space-y-3">
                <label className="block text-sm font-medium" htmlFor="content-media-file">
                  {t('mediaFile')}
                </label>
                <input
                  id="content-media-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4"
                  className="block w-full text-sm file:mr-4 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <p className="text-xs leading-5 text-neutral-500">{t('mediaHint')}</p>
                <label className="block text-sm font-medium" htmlFor="content-media-alt">
                  {t('altText')}
                </label>
                <Input
                  id="content-media-alt"
                  value={altText}
                  maxLength={500}
                  onChange={(event) => setAltText(event.target.value)}
                />
                {file ? (
                  <p className="text-sm text-neutral-600">
                    {file.name} · {formatBytes(file.size)}
                  </p>
                ) : null}
                <Button
                  className="w-full"
                  type="button"
                  disabled={!postId || !file || uploading}
                  onClick={() => void uploadMedia()}
                >
                  <Upload className="mr-2 size-4" aria-hidden="true" />
                  {uploading ? t('uploading') : t('uploadAction')}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3" aria-live="polite" aria-busy={loadingAssets}>
          {loadingAssets ? <p className="text-sm text-neutral-500">{t('loadingMedia')}</p> : null}
          {!loadingAssets && postId && assets.length === 0 ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-neutral-500">
              {t('emptyMedia')}
            </div>
          ) : null}
          {!postId ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-neutral-500">
              {t('selectPost')}
            </div>
          ) : null}
          {assets.map((asset) => (
            <article key={asset.id} className="rounded-2xl border bg-white p-5">
              <div className="flex items-start gap-3">
                <FileImage className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{asset.originalFileName}</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {t(`kind.${asset.kind}`)} · {formatBytes(asset.sizeBytes)}
                  </p>
                  {asset.altText ? (
                    <p className="mt-2 text-sm leading-6 text-neutral-600">{asset.altText}</p>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
