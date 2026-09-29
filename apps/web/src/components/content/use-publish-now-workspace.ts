'use client';

import type { Session } from '@supabase/supabase-js';
import type { PublishNowReadiness, PublishNowResponse } from '@recruitops/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPublishNowReadiness,
  PublicationApiError,
  queuePublishNow as queuePublishNowRequest,
} from '@/lib/publications/api';

interface UsePublishNowWorkspaceInput {
  session: Session | null;
  apiUrl: string | null;
  canMutate: boolean;
  postVariantId: string | null;
}

export function usePublishNowWorkspace({
  session,
  apiUrl,
  canMutate,
  postVariantId,
}: UsePublishNowWorkspaceInput) {
  const requestVersion = useRef(0);
  const [publishReadiness, setPublishReadiness] = useState<PublishNowReadiness | null>(null);
  const [publishDestinationId, setPublishDestinationIdState] = useState('');
  const [loadingPublishReadiness, setLoadingPublishReadiness] = useState(false);
  const [publishReadinessError, setPublishReadinessError] = useState(false);
  const [publishingNow, setPublishingNow] = useState(false);
  const [publishNowErrorStatus, setPublishNowErrorStatus] = useState<number | null>(null);
  const [publishNowResult, setPublishNowResult] = useState<PublishNowResponse | null>(null);
  const [pendingPublicationId, setPendingPublicationId] = useState<string | null>(null);

  const loadPublishReadiness = useCallback(async () => {
    if (!session?.access_token || !apiUrl || !postVariantId) {
      setPublishReadiness(null);
      setPublishDestinationIdState('');
      return;
    }

    const version = ++requestVersion.current;
    setLoadingPublishReadiness(true);
    setPublishReadinessError(false);
    try {
      const response = await getPublishNowReadiness(apiUrl, session.access_token, postVariantId);
      if (version !== requestVersion.current) return;
      setPublishReadiness(response);
      setPublishDestinationIdState((current) =>
        response.destinations.some((destination) => destination.id === current)
          ? current
          : (response.destinations[0]?.id ?? ''),
      );
    } catch {
      if (version !== requestVersion.current) return;
      setPublishReadiness(null);
      setPublishDestinationIdState('');
      setPublishReadinessError(true);
    } finally {
      if (version === requestVersion.current) setLoadingPublishReadiness(false);
    }
  }, [apiUrl, postVariantId, session?.access_token]);

  useEffect(() => {
    requestVersion.current += 1;
    setPublishReadiness(null);
    setPublishDestinationIdState('');
    setPublishReadinessError(false);
    setPublishNowResult(null);
    setPublishNowErrorStatus(null);
    setPendingPublicationId(null);
    if (postVariantId) void loadPublishReadiness();
  }, [loadPublishReadiness, postVariantId]);

  const setPublishDestinationId = useCallback((nextDestinationId: string) => {
    setPublishDestinationIdState(nextDestinationId);
    setPublishNowResult(null);
    setPublishNowErrorStatus(null);
    setPendingPublicationId(null);
  }, []);

  const queuePublishNow = useCallback(async () => {
    if (
      !session?.access_token ||
      !apiUrl ||
      !canMutate ||
      !postVariantId ||
      !publishDestinationId ||
      !publishReadiness?.canPublish ||
      publishingNow
    ) {
      return;
    }

    const publicationId = pendingPublicationId ?? globalThis.crypto.randomUUID();
    if (!pendingPublicationId) setPendingPublicationId(publicationId);
    setPublishingNow(true);
    setPublishNowErrorStatus(null);
    setPublishNowResult(null);

    try {
      const response = await queuePublishNowRequest(apiUrl, session.access_token, {
        publicationId,
        postVariantId,
        destinationId: publishDestinationId,
      });
      setPublishNowResult(response);
      setPendingPublicationId(null);
    } catch (error) {
      setPublishNowErrorStatus(error instanceof PublicationApiError ? error.status : 0);
      await loadPublishReadiness();
    } finally {
      setPublishingNow(false);
    }
  }, [
    apiUrl,
    canMutate,
    loadPublishReadiness,
    pendingPublicationId,
    postVariantId,
    publishDestinationId,
    publishingNow,
    publishReadiness?.canPublish,
    session?.access_token,
  ]);

  return {
    publishReadiness,
    publishDestinationId,
    loadingPublishReadiness,
    publishReadinessError,
    publishingNow,
    publishNowErrorStatus,
    publishNowResult,
    setPublishDestinationId,
    loadPublishReadiness,
    queuePublishNow,
  };
}
