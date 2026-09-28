'use client';

import type { Session } from '@supabase/supabase-js';
import {
  CreatePostSchema,
  PrivateFileUploadIntentSchema,
  RegisterMediaAssetSchema,
  ReplacePostVariantMediaSelectionSchema,
  UpsertPostVariantSchema,
  type Job,
  type MediaAsset,
  type Post,
  type PostVariantRecord,
  type SocialPlatform,
} from '@recruitops/contracts';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ContentApiError,
  createPost,
  getPostVariantMediaSelection,
  listPosts,
  listPostVariants,
  replacePostVariantMediaSelection,
  upsertPostVariant,
} from '@/lib/content/api';
import { FilesApiError, listMediaAssets, registerMediaAsset } from '@/lib/files/api';
import { listJobs } from '@/lib/jobs/api';
import { PrivateFileAccessError, uploadPrivateFile } from '@/lib/storage/private-files';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  MEDIA_UPLOAD_POLICY,
  configuredApiUrl,
  parseHashtags,
} from './content-studio-utils';

const PrincipalSchema = z.object({
  id: z.string().min(1),
  email: z.email().nullable(),
  role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'VIEWER']),
});

type Role = z.infer<typeof PrincipalSchema>['role'];
export type ContentStudioPostForm = {
  jobId: string;
  title: string;
  baseContent: string;
  language: 'vi' | 'en';
};

export function useContentStudio() {
  const t = useTranslations('contentMedia');
  const variantT = useTranslations('contentStudio');
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

  const [variants, setVariants] = useState<PostVariantRecord[]>([]);
  const [platform, setPlatform] = useState<SocialPlatform>('FACEBOOK');
  const [variantText, setVariantText] = useState('');
  const [variantHashtags, setVariantHashtags] = useState('');
  const [variantLink, setVariantLink] = useState('');
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [savingVariant, setSavingVariant] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);

  const apiUrl = useMemo(configuredApiUrl, []);
  const canMutate = role === 'OWNER' || role === 'ADMIN' || role === 'RECRUITER';
  const form = useForm<ContentStudioPostForm>({
    defaultValues: { jobId: '', title: '', baseContent: '', language: 'vi' },
  });
  const selectedJobId = form.watch('jobId');
  const selectedPost = posts.find((post) => post.id === postId);
  const selectedVariant = variants.find((variant) => variant.platform === platform);

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
        setVariants([]);
        setPostId('');
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.access_token || !apiUrl) return;
    let active = true;

    void Promise.all([
      fetch(`${apiUrl}/auth/me`, {
        headers: { authorization: `Bearer ${session.access_token}` },
      }).then(async (response) => {
        if (!response.ok) throw new Error('principal_failed');
        return PrincipalSchema.parse(await response.json());
      }),
      listJobs(apiUrl, session.access_token),
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
  }, [apiUrl, form, session, t]);

  const loadPostsForJob = useCallback(
    async (jobId: string) => {
      if (!session?.access_token || !apiUrl || !jobId) {
        setPosts([]);
        setPostId('');
        return;
      }
      setLoadingPosts(true);
      setError(null);
      try {
        const response = await listPosts(apiUrl, session.access_token, jobId);
        setPosts(response.items);
        setPostId((current) =>
          response.items.some((post) => post.id === current)
            ? current
            : (response.items[0]?.id ?? ''),
        );
      } catch {
        setPosts([]);
        setPostId('');
        setError(t('loadFailed'));
      } finally {
        setLoadingPosts(false);
      }
    },
    [apiUrl, session?.access_token, t],
  );

  const loadAssets = useCallback(
    async (nextPostId: string) => {
      if (!session?.access_token || !apiUrl || !nextPostId) {
        setAssets([]);
        return;
      }
      setLoadingAssets(true);
      setError(null);
      try {
        setAssets(await listMediaAssets(apiUrl, session.access_token, nextPostId));
      } catch {
        setAssets([]);
        setError(t('mediaLoadFailed'));
      } finally {
        setLoadingAssets(false);
      }
    },
    [apiUrl, session?.access_token, t],
  );

  const loadVariants = useCallback(
    async (nextPostId: string) => {
      if (!session?.access_token || !apiUrl || !nextPostId) {
        setVariants([]);
        return;
      }
      setLoadingVariants(true);
      try {
        setVariants(await listPostVariants(apiUrl, session.access_token, nextPostId));
      } catch {
        setVariants([]);
        setError(variantT('variantLoadFailed'));
      } finally {
        setLoadingVariants(false);
      }
    },
    [apiUrl, session?.access_token, variantT],
  );

  useEffect(() => {
    if (selectedJobId) void loadPostsForJob(selectedJobId);
  }, [loadPostsForJob, selectedJobId]);

  useEffect(() => {
    if (!postId) {
      setAssets([]);
      setVariants([]);
      return;
    }
    void Promise.all([loadAssets(postId), loadVariants(postId)]);
  }, [loadAssets, loadVariants, postId]);

  useEffect(() => {
    if (selectedVariant) {
      setVariantText(selectedVariant.text);
      setVariantHashtags(selectedVariant.hashtags.join(', '));
      setVariantLink(selectedVariant.link ?? '');
      return;
    }
    setVariantText(selectedPost?.baseContent ?? '');
    setVariantHashtags('');
    setVariantLink('');
    setSelectedMediaIds([]);
  }, [selectedPost?.baseContent, selectedVariant]);

  useEffect(() => {
    if (!selectedVariant || !session?.access_token || !apiUrl) {
      setSelectedMediaIds([]);
      return;
    }
    let active = true;
    void getPostVariantMediaSelection(apiUrl, session.access_token, selectedVariant.id)
      .then((selection) => {
        if (active) setSelectedMediaIds(selection.mediaAssetIds);
      })
      .catch(() => {
        if (active) setError(variantT('selectionLoadFailed'));
      });
    return () => {
      active = false;
    };
  }, [apiUrl, selectedVariant, session?.access_token, variantT]);

  async function onCreateDraft(values: ContentStudioPostForm) {
    if (!session?.access_token || !apiUrl || !canMutate) return;
    setError(null);
    const parsed = CreatePostSchema.safeParse(values);
    if (!parsed.success) {
      setError(t('invalidDraft'));
      return;
    }

    try {
      const created = await createPost(apiUrl, session.access_token, parsed.data);
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
    if (!session?.access_token || !apiUrl || !postId || !file || !canMutate) return;
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
      await registerMediaAsset(apiUrl, session.access_token, registration);
      setFile(null);
      setAltText('');
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

  async function saveVariant() {
    if (!session?.access_token || !apiUrl || !postId || !canMutate) return;
    const parsed = UpsertPostVariantSchema.safeParse({
      text: variantText,
      hashtags: parseHashtags(variantHashtags),
      ...(variantLink.trim() ? { link: variantLink.trim() } : {}),
      metadata: {},
    });
    if (!parsed.success) {
      setError(variantT('invalidVariant'));
      return;
    }

    setSavingVariant(true);
    setError(null);
    try {
      const saved = await upsertPostVariant(
        apiUrl,
        session.access_token,
        postId,
        platform,
        parsed.data,
      );
      setVariants((current) =>
        [...current.filter((variant) => variant.platform !== platform), saved].sort((a, b) =>
          a.platform.localeCompare(b.platform),
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof ContentApiError && caught.status === 403
          ? t('forbidden')
          : variantT('variantSaveFailed'),
      );
    } finally {
      setSavingVariant(false);
    }
  }

  function toggleSelectedMedia(mediaAssetId: string) {
    setSelectedMediaIds((current) =>
      current.includes(mediaAssetId)
        ? current.filter((id) => id !== mediaAssetId)
        : [...current, mediaAssetId],
    );
  }

  function moveSelectedMedia(mediaAssetId: string, direction: -1 | 1) {
    setSelectedMediaIds((current) => {
      const index = current.indexOf(mediaAssetId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  }

  async function saveMediaSelection() {
    if (!selectedVariant || !session?.access_token || !apiUrl || !canMutate) return;
    const parsed = ReplacePostVariantMediaSelectionSchema.safeParse({ mediaAssetIds: selectedMediaIds });
    if (!parsed.success) {
      setError(variantT('invalidSelection'));
      return;
    }

    setSavingSelection(true);
    setError(null);
    try {
      const saved = await replacePostVariantMediaSelection(
        apiUrl,
        session.access_token,
        selectedVariant.id,
        parsed.data,
      );
      setSelectedMediaIds(saved.mediaAssetIds);
    } catch (caught) {
      setError(
        caught instanceof ContentApiError && caught.status === 403
          ? t('forbidden')
          : variantT('selectionSaveFailed'),
      );
    } finally {
      setSavingSelection(false);
    }
  }

  return {
    session,
    jobs,
    posts,
    postId,
    setPostId,
    assets,
    file,
    setFile,
    altText,
    setAltText,
    loadingPosts,
    loadingAssets,
    uploading,
    error,
    apiUrl,
    canMutate,
    form,
    loadAssets: () => (postId ? loadAssets(postId) : Promise.resolve()),
    onCreateDraft,
    uploadMedia,
    variants,
    platform,
    setPlatform,
    variantText,
    setVariantText,
    variantHashtags,
    setVariantHashtags,
    variantLink,
    setVariantLink,
    selectedVariant,
    selectedMediaIds,
    loadingVariants,
    savingVariant,
    savingSelection,
    saveVariant,
    toggleSelectedMedia,
    moveSelectedMedia,
    saveMediaSelection,
  };
}
