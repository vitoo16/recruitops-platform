'use client';

import type { Session } from '@supabase/supabase-js';
import type { PublishNowReadiness, SchedulePublicationResponse } from '@recruitops/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PublicationApiError,
  schedulePublication as schedulePublicationRequest,
} from '@/lib/publications/api';
import { localDateValue, localScheduleToIso } from './publication-schedule-utils';

interface UsePublicationScheduleWorkspaceInput {
  session: Session | null;
  apiUrl: string | null;
  canMutate: boolean;
  postVariantId: string | null;
  readiness: PublishNowReadiness | null;
}

export function usePublicationScheduleWorkspace({
  session,
  apiUrl,
  canMutate,
  postVariantId,
  readiness,
}: UsePublicationScheduleWorkspaceInput) {
  const [scheduleDestinationId, setScheduleDestinationIdState] = useState('');
  const [scheduleDate, setScheduleDateState] = useState('');
  const [scheduleTime, setScheduleTimeState] = useState('');
  const [scheduleTimeZone, setScheduleTimeZone] = useState('');
  const [minimumScheduleDate, setMinimumScheduleDate] = useState('');
  const [schedulingPublication, setSchedulingPublication] = useState(false);
  const [scheduleValidationError, setScheduleValidationError] = useState(false);
  const [scheduleErrorStatus, setScheduleErrorStatus] = useState<number | null>(null);
  const [scheduleResult, setScheduleResult] = useState<SchedulePublicationResponse | null>(null);
  const [scheduleActivityVersion, setScheduleActivityVersion] = useState(0);
  const [pendingSchedulePublicationId, setPendingSchedulePublicationId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setScheduleTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time');
    setMinimumScheduleDate(localDateValue(new Date()));
  }, []);

  useEffect(() => {
    setScheduleDestinationIdState('');
    setScheduleDateState('');
    setScheduleTimeState('');
    setScheduleValidationError(false);
    setScheduleErrorStatus(null);
    setScheduleResult(null);
    setScheduleActivityVersion(0);
    setPendingSchedulePublicationId(null);
  }, [postVariantId]);

  useEffect(() => {
    const destinations = readiness?.destinations ?? [];
    if (destinations.some((destination) => destination.id === scheduleDestinationId)) return;
    const next = destinations[0]?.id ?? '';
    if (next !== scheduleDestinationId) {
      setScheduleDestinationIdState(next);
      setScheduleErrorStatus(null);
      setScheduleResult(null);
      setPendingSchedulePublicationId(null);
    }
  }, [readiness?.destinations, scheduleDestinationId]);

  const scheduledAtIso = useMemo(
    () => localScheduleToIso(scheduleDate, scheduleTime),
    [scheduleDate, scheduleTime],
  );
  const scheduleTimeIsFuture = scheduledAtIso !== null && Date.parse(scheduledAtIso) > Date.now();
  const canSchedule = Boolean(
    canMutate &&
    postVariantId &&
    readiness?.canPublish &&
    scheduleDestinationId &&
    scheduleTimeIsFuture &&
    !schedulingPublication,
  );

  const resetIntentResult = useCallback(() => {
    setScheduleValidationError(false);
    setScheduleErrorStatus(null);
    setScheduleResult(null);
    setPendingSchedulePublicationId(null);
  }, []);

  const setScheduleDestinationId = useCallback(
    (value: string) => {
      setScheduleDestinationIdState(value);
      resetIntentResult();
    },
    [resetIntentResult],
  );

  const setScheduleDate = useCallback(
    (value: string) => {
      setScheduleDateState(value);
      resetIntentResult();
    },
    [resetIntentResult],
  );

  const setScheduleTime = useCallback(
    (value: string) => {
      setScheduleTimeState(value);
      resetIntentResult();
    },
    [resetIntentResult],
  );

  const schedulePublication = useCallback(async () => {
    if (
      !session?.access_token ||
      !apiUrl ||
      !canMutate ||
      !postVariantId ||
      !readiness?.canPublish ||
      !scheduleDestinationId ||
      schedulingPublication
    ) {
      return;
    }

    const dispatchIso = localScheduleToIso(scheduleDate, scheduleTime);
    if (!dispatchIso || Date.parse(dispatchIso) <= Date.now()) {
      setScheduleValidationError(true);
      return;
    }

    const publicationId = pendingSchedulePublicationId ?? globalThis.crypto.randomUUID();
    if (!pendingSchedulePublicationId) setPendingSchedulePublicationId(publicationId);
    setSchedulingPublication(true);
    setScheduleValidationError(false);
    setScheduleErrorStatus(null);
    setScheduleResult(null);

    try {
      const response = await schedulePublicationRequest(apiUrl, session.access_token, {
        publicationId,
        postVariantId,
        destinationId: scheduleDestinationId,
        scheduledAt: dispatchIso,
      });
      setScheduleResult(response);
      setPendingSchedulePublicationId(null);
    } catch (error) {
      setScheduleErrorStatus(error instanceof PublicationApiError ? error.status : 0);
    } finally {
      setSchedulingPublication(false);
      setScheduleActivityVersion((current) => current + 1);
    }
  }, [
    apiUrl,
    canMutate,
    pendingSchedulePublicationId,
    postVariantId,
    readiness?.canPublish,
    scheduleDate,
    scheduleDestinationId,
    scheduleTime,
    schedulingPublication,
    session?.access_token,
  ]);

  return {
    scheduleDestinationId,
    scheduleDate,
    scheduleTime,
    scheduleTimeZone,
    minimumScheduleDate,
    schedulingPublication,
    scheduleValidationError,
    scheduleErrorStatus,
    scheduleResult,
    scheduleActivityVersion,
    scheduleTimeIsFuture,
    canSchedule,
    setScheduleDestinationId,
    setScheduleDate,
    setScheduleTime,
    schedulePublication,
  };
}
