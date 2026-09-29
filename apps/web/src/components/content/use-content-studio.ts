'use client';

import { useCallback, useState } from 'react';
import { useContentStudioSession } from './use-content-studio-session';
import { usePostMediaWorkspace } from './use-post-media-workspace';
import { usePostVariantWorkspace } from './use-post-variant-workspace';
import { usePublicationScheduleWorkspace } from './use-publication-schedule-workspace';
import { usePublicationStatusWorkspace } from './use-publication-status-workspace';
import { usePublishNowWorkspace } from './use-publish-now-workspace';

export type { ContentStudioPostForm } from './content-studio-types';

export function useContentStudio() {
  const [error, setError] = useState<string | null>(null);
  const reportError = useCallback((message: string | null) => setError(message), []);
  const context = useContentStudioSession(reportError);
  const postMedia = usePostMediaWorkspace({
    session: context.session,
    apiUrl: context.apiUrl,
    canMutate: context.canMutate,
    defaultJobId: context.defaultJobId,
    reportError,
  });
  const variants = usePostVariantWorkspace({
    session: context.session,
    apiUrl: context.apiUrl,
    canMutate: context.canMutate,
    postId: postMedia.postId,
    baseContent: postMedia.selectedPost?.baseContent ?? '',
    reportError,
  });
  const publishing = usePublishNowWorkspace({
    session: context.session,
    apiUrl: context.apiUrl,
    canMutate: context.canMutate,
    postVariantId: variants.selectedVariant?.id ?? null,
  });
  const scheduling = usePublicationScheduleWorkspace({
    session: context.session,
    apiUrl: context.apiUrl,
    canMutate: context.canMutate,
    postVariantId: variants.selectedVariant?.id ?? null,
    readiness: publishing.publishReadiness,
  });
  const publicationStatus = usePublicationStatusWorkspace({
    session: context.session,
    apiUrl: context.apiUrl,
    canMutate: context.canMutate,
    postVariantId: variants.selectedVariant?.id ?? null,
    publishResultId: publishing.publishNowResult?.publication.id ?? null,
    scheduleActivityVersion: scheduling.scheduleActivityVersion,
  });

  return {
    ...context,
    ...postMedia,
    ...variants,
    ...publishing,
    ...scheduling,
    ...publicationStatus,
    error,
  };
}
