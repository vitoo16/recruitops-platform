'use client';

import type { Session } from '@supabase/supabase-js';
import {
  ReplacePostVariantMediaSelectionSchema,
  UpsertPostVariantSchema,
  type PostVariantRecord,
  type SocialPlatform,
} from '@recruitops/contracts';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import {
  ContentApiError,
  getPostVariantMediaSelection,
  listPostVariants,
  replacePostVariantMediaSelection,
  upsertPostVariant,
} from '@/lib/content/api';
import { parseHashtags } from './content-studio-utils';
import type { ContentStudioErrorReporter } from './content-studio-types';

interface UsePostVariantWorkspaceInput {
  session: Session | null;
  apiUrl: string | null;
  canMutate: boolean;
  postId: string;
  baseContent: string;
  reportError: ContentStudioErrorReporter;
}

export function usePostVariantWorkspace({
  session,
  apiUrl,
  canMutate,
  postId,
  baseContent,
  reportError,
}: UsePostVariantWorkspaceInput) {
  const contentT = useTranslations('contentMedia');
  const t = useTranslations('contentStudio');
  const [variants, setVariants] = useState<PostVariantRecord[]>([]);
  const [platform, setPlatform] = useState<SocialPlatform>('FACEBOOK');
  const [variantText, setVariantText] = useState('');
  const [variantHashtags, setVariantHashtags] = useState('');
  const [variantLink, setVariantLink] = useState('');
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [savingVariant, setSavingVariant] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const selectedVariant = variants.find((variant) => variant.platform === platform);

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
        reportError(t('variantLoadFailed'));
      } finally {
        setLoadingVariants(false);
      }
    },
    [apiUrl, reportError, session?.access_token, t],
  );

  useEffect(() => {
    if (postId) void loadVariants(postId);
    else {
      setVariants([]);
      setSelectedMediaIds([]);
    }
  }, [loadVariants, postId]);

  useEffect(() => {
    if (selectedVariant) {
      setVariantText(selectedVariant.text);
      setVariantHashtags(selectedVariant.hashtags.join(', '));
      setVariantLink(selectedVariant.link ?? '');
      return;
    }
    setVariantText(baseContent);
    setVariantHashtags('');
    setVariantLink('');
    setSelectedMediaIds([]);
  }, [baseContent, selectedVariant]);

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
        if (active) reportError(t('selectionLoadFailed'));
      });
    return () => {
      active = false;
    };
  }, [apiUrl, reportError, selectedVariant, session?.access_token, t]);

  async function saveVariant() {
    if (!session?.access_token || !apiUrl || !postId || !canMutate) return;
    const parsed = UpsertPostVariantSchema.safeParse({
      text: variantText,
      hashtags: parseHashtags(variantHashtags),
      ...(variantLink.trim() ? { link: variantLink.trim() } : {}),
      metadata: {},
    });
    if (!parsed.success) {
      reportError(t('invalidVariant'));
      return;
    }

    setSavingVariant(true);
    reportError(null);
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
      reportError(
        caught instanceof ContentApiError && caught.status === 403
          ? contentT('forbidden')
          : t('variantSaveFailed'),
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
      const currentId = next[index];
      const targetId = next[nextIndex];
      if (!currentId || !targetId) return current;
      next[index] = targetId;
      next[nextIndex] = currentId;
      return next;
    });
  }

  async function saveMediaSelection() {
    if (!selectedVariant || !session?.access_token || !apiUrl || !canMutate) return;
    const parsed = ReplacePostVariantMediaSelectionSchema.safeParse({
      mediaAssetIds: selectedMediaIds,
    });
    if (!parsed.success) {
      reportError(t('invalidSelection'));
      return;
    }

    setSavingSelection(true);
    reportError(null);
    try {
      const saved = await replacePostVariantMediaSelection(
        apiUrl,
        session.access_token,
        selectedVariant.id,
        parsed.data,
      );
      setSelectedMediaIds(saved.mediaAssetIds);
    } catch (caught) {
      reportError(
        caught instanceof ContentApiError && caught.status === 403
          ? contentT('forbidden')
          : t('selectionSaveFailed'),
      );
    } finally {
      setSavingSelection(false);
    }
  }

  return {
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
