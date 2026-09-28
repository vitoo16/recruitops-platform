'use client';

import type { Session } from '@supabase/supabase-js';
import {
  CreatePostSchema,
  PrivateFileUploadIntentSchema,
  RegisterMediaAssetSchema,
  type MediaAsset,
  type Post,
} from '@recruitops/contracts';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ContentApiError, createPost, listPosts } from '@/lib/content/api';
import { FilesApiError, listMediaAssets, registerMediaAsset } from '@/lib/files/api';
import { PrivateFileAccessError, uploadPrivateFile } from '@/lib/storage/private-files';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { MEDIA_UPLOAD_POLICY } from './content-studio-utils';
import type { ContentStudioErrorReporter, ContentStudioPostForm } from './content-studio-types';

interface UsePostMediaWorkspaceInput {
  session: Session | null;
  apiUrl: string | null;
  canMutate: boolean;
  defaultJobId: string;
  reportError: ContentStudioErrorReporter;
}

const emptyPostForm: ContentStudioPostForm = {
  jobId: '',
  title: '',
  baseContent: '',
  language: 'vi',
};

export function usePostMediaWorkspace({
  session,
  apiUrl,
  canMutate,
  defaultJobId,
  reportError,
}: UsePostMediaWorkspaceInput) {
  const t = useTranslations('contentMedia');
  const [posts, setPosts] = useState<Post[]>([]);
  const [postId, setPostId] = useState('');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const [altText, setAltText] = useState('');
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploading, setUploading] = useState(false);
  const form = useForm<ContentStudioPostForm>({ defaultValues: emptyPostForm });
  const selectedJobId = form.watch('jobId');
  const selectedPost = posts.find((post) => post.id === postId);

  useEffect(() => {
    if (defaultJobId && !form.getValues('jobId')) {
      form.setValue('jobId', defaultJobId);
    }
  }, [defaultJobId, form]);

  useEffect(() => {
    if (!session) {
      setPosts([]);
      setAssets([]);
      setPostId('');
      setFile(null);
      setAltText('');
      setFileInputVersion((current) => current + 1);
      form.reset(emptyPostForm);
    }
  }, [form, session]);

  const loadPostsForJob = useCallback(
    async (jobId: string) => {
      if (!session?.access_token || !apiUrl || !jobId) {
        setPosts([]);
        setPostId('');
        return;
      }
      setLoadingPosts(true);
      reportError(null);
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
        reportError(t('loadFailed'));
      } finally {
        setLoadingPosts(false);
      }
    },
    [apiUrl, reportError, session?.access_token, t],
  );

  const loadAssets = useCallback(
    async (nextPostId: string) => {
      if (!session?.access_token || !apiUrl || !nextPostId) {
        setAssets([]);
        return;
      }
      setLoadingAssets(true);
      reportError(null);
      try {
        setAssets(await listMediaAssets(apiUrl, session.access_token, nextPostId));
      } catch {
        setAssets([]);
        reportError(t('mediaLoadFailed'));
      } finally {
        setLoadingAssets(false);
      }
    },
    [apiUrl, reportError, session?.access_token, t],
  );

  useEffect(() => {
    if (selectedJobId) void loadPostsForJob(selectedJobId);
  }, [loadPostsForJob, selectedJobId]);

  useEffect(() => {
    if (postId) void loadAssets(postId);
    else setAssets([]);
  }, [loadAssets, postId]);

  async function onCreateDraft(values: ContentStudioPostForm) {
    if (!session?.access_token || !apiUrl || !canMutate) return;
    reportError(null);
    const parsed = CreatePostSchema.safeParse(values);
    if (!parsed.success) {
      reportError(t('invalidDraft'));
      return;
    }

    try {
      const created = await createPost(apiUrl, session.access_token, parsed.data);
      await loadPostsForJob(created.jobId);
      setPostId(created.id);
      form.setValue('title', '');
      form.setValue('baseContent', '');
    } catch (caught) {
      reportError(
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
      reportError(t('storageUnavailable'));
      return;
    }

    const intent = PrivateFileUploadIntentSchema.safeParse({
      purpose: 'CONTENT_MEDIA',
      ownerUserId: session.user.id,
      ownerEntityId: postId,
      objectId: crypto.randomUUID(),
      originalFileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!intent.success) {
      reportError(t('invalidMedia'));
      return;
    }

    setUploading(true);
    reportError(null);
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
      setFileInputVersion((current) => current + 1);
      await loadAssets(postId);
    } catch (caught) {
      if (caught instanceof PrivateFileAccessError) {
        reportError(
          caught.message.includes('MIME_TYPE_NOT_ALLOWED') ||
            caught.message.includes('FILE_TOO_LARGE')
            ? t('invalidMedia')
            : t('uploadFailed'),
        );
      } else if (caught instanceof FilesApiError && caught.status === 403) {
        reportError(t('forbidden'));
      } else {
        reportError(t('uploadFailed'));
      }
    } finally {
      setUploading(false);
    }
  }

  return {
    form,
    posts,
    postId,
    setPostId,
    selectedPost,
    assets,
    file,
    setFile,
    fileInputVersion,
    altText,
    setAltText,
    loadingPosts,
    loadingAssets,
    uploading,
    loadAssets: () => (postId ? loadAssets(postId) : Promise.resolve()),
    onCreateDraft,
    uploadMedia,
  };
}
