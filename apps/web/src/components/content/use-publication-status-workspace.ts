'use client';

import type { Session } from '@supabase/supabase-js';
import type {
  PublicationManualRetryAcceptance,
  PublicationStatusRecord,
} from '@recruitops/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPublicationStatus,
  PublicationApiError,
  retryPublication as retryPublicationRequest,
} from '@/lib/publications/api';

interface UsePublicationStatusWorkspaceInput {
  session: Session | null;
  apiUrl: string | null;
  canMutate: boolean;
  postVariantId: string | null;
  publishResultId: string | null;
}

export function usePublicationStatusWorkspace({
  session,
  apiUrl,
  canMutate,
  postVariantId,
  publishResultId,
}: UsePublicationStatusWorkspaceInput) {
  const requestVersion = useRef(0);
  const [publicationStatuses, setPublicationStatuses] = useState<
    readonly PublicationStatusRecord[]
  >([]);
  const [publicationStatusesTruncated, setPublicationStatusesTruncated] = useState(false);
  const [loadingPublicationStatuses, setLoadingPublicationStatuses] = useState(false);
  const [publicationStatusLoadError, setPublicationStatusLoadError] = useState(false);
  const [retryingPublicationId, setRetryingPublicationId] = useState<string | null>(null);
  const [publicationRetryErrorId, setPublicationRetryErrorId] = useState<string | null>(null);
  const [publicationRetryAcceptance, setPublicationRetryAcceptance] =
    useState<PublicationManualRetryAcceptance | null>(null);

  const loadPublicationStatuses = useCallback(async () => {
    if (!session?.access_token || !apiUrl || !postVariantId) {
      setPublicationStatuses([]);
      setPublicationStatusesTruncated(false);
      return;
    }

    const version = ++requestVersion.current;
    setLoadingPublicationStatuses(true);
    setPublicationStatusLoadError(false);
    try {
      const response = await getPublicationStatus(apiUrl, session.access_token, postVariantId);
      if (version !== requestVersion.current) return;
      setPublicationStatuses(response.items);
      setPublicationStatusesTruncated(response.truncated);
    } catch {
      if (version !== requestVersion.current) return;
      setPublicationStatuses([]);
      setPublicationStatusesTruncated(false);
      setPublicationStatusLoadError(true);
    } finally {
      if (version === requestVersion.current) setLoadingPublicationStatuses(false);
    }
  }, [apiUrl, postVariantId, session?.access_token]);

  useEffect(() => {
    requestVersion.current += 1;
    setPublicationStatuses([]);
    setPublicationStatusesTruncated(false);
    setPublicationStatusLoadError(false);
    setRetryingPublicationId(null);
    setPublicationRetryErrorId(null);
    setPublicationRetryAcceptance(null);
    if (postVariantId) void loadPublicationStatuses();
  }, [loadPublicationStatuses, postVariantId]);

  useEffect(() => {
    if (!publishResultId || !postVariantId) return;
    void loadPublicationStatuses();
  }, [loadPublicationStatuses, postVariantId, publishResultId]);

  const retryPublication = useCallback(
    async (publicationId: string) => {
      if (!session?.access_token || !apiUrl || !canMutate || retryingPublicationId) return;
      setRetryingPublicationId(publicationId);
      setPublicationRetryErrorId(null);
      setPublicationRetryAcceptance(null);
      try {
        const response = await retryPublicationRequest(apiUrl, session.access_token, publicationId);
        setPublicationRetryAcceptance(response.acceptance);
        await loadPublicationStatuses();
      } catch (error) {
        setPublicationRetryErrorId(publicationId);
        if (error instanceof PublicationApiError && error.status === 409) {
          await loadPublicationStatuses();
        }
      } finally {
        setRetryingPublicationId(null);
      }
    },
    [apiUrl, canMutate, loadPublicationStatuses, retryingPublicationId, session?.access_token],
  );

  return {
    publicationStatuses,
    publicationStatusesTruncated,
    loadingPublicationStatuses,
    publicationStatusLoadError,
    retryingPublicationId,
    publicationRetryErrorId,
    publicationRetryAcceptance,
    loadPublicationStatuses,
    retryPublication,
  };
}
