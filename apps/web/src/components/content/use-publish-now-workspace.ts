'use client';

import type { Session } from '@supabase/supabase-js';
import type { PublishNowReadiness, PublishNowResponse } from '@recruitops/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPublishNowReadiness,
  PublicationApiError,
  queuePublishNow,
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
  const [readiness, setReadiness] = useState<PublishNowReadiness | null>(null);
  const [destinationId, setDestinationIdState] = useState('');
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [readinessError, setReadinessError] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishErrorStatus, setPublishErrorStatus] = useState<number | null>(null);
  const [result, setResult] = useState<PublishNowResponse | null>(null);
  const [pendingPublicationId, setPendingPublicationId] = useState<string | null>(null);

  const loadReadiness = useCallback(async () => {
    if (!session?.access_token || !apiUrl || !postVariantId) {
      setReadiness(null);
      setDestinationIdState('');
      return;
    }

    const version = ++requestVersion.current;
    setLoadingReadiness(true);
    setReadinessError(false);
    try {
      const response = await getPublishNowReadiness(apiUrl, session.access_token, postVariantId);
      if (version !== requestVersion.current) return;
      setReadiness(response);
      setDestinationIdState((current) =>
        response.destinations.some((destination) => destination.id === current)
          ? current
          : (response.destinations[0]?.id ?? ''),
      );
    } catch {
      if (version !== requestVersion.current) return;
      setReadiness(null);
      setDestinationIdState('');
      setReadinessError(true);
    } finally {
      if (version === requestVersion.current) setLoadingReadiness(false);
    }
  }, [apiUrl, postVariantId, session?.access_token]);

  useEffect(() => {
    requestVersion.current += 1;
    setReadiness(null);
    setDestinationIdState('');
    setReadinessError(false);
    setResult(null);
    setPublishErrorStatus(null);
    setPendingPublicationId(null);
    if (postVariantId) void loadReadiness();
  }, [loadReadiness, postVariantId]);

  const setDestinationId = useCallback((nextDestinationId: string) => {
    setDestinationIdState(nextDestinationId);
    setResult(null);
    setPublishErrorStatus(null);
    setPendingPublicationId(null);
  }, []);

  const publishNow = useCallback(async () => {
    if (
      !session?.access_token ||
      !apiUrl ||
      !canMutate ||
      !postVariantId ||
      !destinationId ||
      !readiness?.canPublish ||
      publishing
    ) {
      return;
    }

    const publicationId = pendingPublicationId ?? globalThis.crypto.randomUUID();
    if (!pendingPublicationId) setPendingPublicationId(publicationId);
    setPublishing(true);
    setPublishErrorStatus(null);
    setResult(null);

    try {
      const response = await queuePublishNow(apiUrl, session.access_token, {
        publicationId,
        postVariantId,
        destinationId,
      });
      setResult(response);
      setPendingPublicationId(null);
    } catch (error) {
      setPublishErrorStatus(error instanceof PublicationApiError ? error.status : 0);
      await loadReadiness();
    } finally {
      setPublishing(false);
    }
  }, [
    apiUrl,
    canMutate,
    destinationId,
    loadReadiness,
    pendingPublicationId,
    postVariantId,
    publishing,
    readiness?.canPublish,
    session?.access_token,
  ]);

  return {
    readiness,
    destinationId,
    loadingReadiness,
    readinessError,
    publishing,
    publishErrorStatus,
    result,
    canMutate,
    setDestinationId,
    loadReadiness,
    publishNow,
  };
}
