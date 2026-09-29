'use client';

import type {
  PublicationStatusRecord,
  PublishNowReadiness,
  SchedulePublicationResponse,
} from '@recruitops/contracts';
import { CalendarDays, Clock3, Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { localDateValue, scheduledPublications } from './publication-schedule-utils';

interface PublicationSchedulePanelProps {
  postVariantId: string | null;
  readiness: PublishNowReadiness | null;
  statuses: readonly PublicationStatusRecord[];
  statusesTruncated: boolean;
  destinationId: string;
  scheduleDate: string;
  scheduleTime: string;
  timeZone: string;
  minimumDate: string;
  scheduling: boolean;
  validationError: boolean;
  errorStatus: number | null;
  result: SchedulePublicationResponse | null;
  canSchedule: boolean;
  canMutate: boolean;
  onDestinationChange(value: string): void;
  onDateChange(value: string): void;
  onTimeChange(value: string): void;
  onSchedule(): void;
}

export function PublicationSchedulePanel({
  postVariantId,
  readiness,
  statuses,
  statusesTruncated,
  destinationId,
  scheduleDate,
  scheduleTime,
  timeZone,
  minimumDate,
  scheduling,
  validationError,
  errorStatus,
  result,
  canSchedule,
  canMutate,
  onDestinationChange,
  onDateChange,
  onTimeChange,
  onSchedule,
}: PublicationSchedulePanelProps) {
  const t = useTranslations('contentStudio.schedule');
  const blockingReasons = useTranslations('contentStudio.publishNow.blockingReasons');
  const locale = useLocale();
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const calendarItems = scheduledPublications(statuses);
  const grouped = calendarItems.reduce<
    Array<{ dateKey: string; label: string; items: PublicationStatusRecord[] }>
  >((groups, item) => {
    if (!item.scheduledAt) return groups;
    const instant = new Date(item.scheduledAt);
    const dateKey = localDateValue(instant);
    const last = groups.at(-1);
    if (last?.dateKey === dateKey) {
      last.items.push(item);
      return groups;
    }
    groups.push({ dateKey, label: dateFormatter.format(instant), items: [item] });
    return groups;
  }, []);

  return (
    <section
      className="space-y-5 rounded-[var(--radius-panel)] border bg-[var(--surface-panel)] p-6 shadow-[var(--shadow-panel)]"
      aria-labelledby="publication-schedule-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--content-secondary)]">{t('eyebrow')}</p>
          <h3
            id="publication-schedule-title"
            className="mt-1 text-xl font-semibold tracking-tight text-balance"
          >
            {t('title')}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--content-secondary)]">
            {t('description')}
          </p>
        </div>
        <CalendarDays className="size-5 shrink-0" aria-hidden="true" />
      </div>

      {!postVariantId ? (
        <p className="rounded-xl border border-dashed px-4 py-5 text-sm text-[var(--content-secondary)]">
          {t('saveVariantFirst')}
        </p>
      ) : null}

      {postVariantId && readiness?.blockingReasons.length ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          <p className="font-medium">{t('blockedTitle')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {readiness.blockingReasons.map((reason) => (
              <li key={reason}>{blockingReasons(reason)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {postVariantId && readiness?.destinations.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 lg:col-span-2">
            <label htmlFor="schedule-destination" className="text-sm font-medium">
              {t('destination')}
            </label>
            <select
              id="schedule-destination"
              name="scheduleDestination"
              className="min-h-11 w-full rounded-xl border bg-[var(--surface-panel)] px-3 text-sm text-[var(--content-primary)]"
              value={destinationId}
              disabled={scheduling}
              onChange={(event) => onDestinationChange(event.target.value)}
            >
              {readiness.destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.name} · {destination.type}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="schedule-date" className="text-sm font-medium">
              {t('date')}
            </label>
            <input
              id="schedule-date"
              name="scheduleDate"
              type="date"
              min={minimumDate || undefined}
              className="min-h-11 w-full rounded-xl border bg-[var(--surface-panel)] px-3 text-sm text-[var(--content-primary)]"
              value={scheduleDate}
              disabled={scheduling}
              onChange={(event) => onDateChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="schedule-time" className="text-sm font-medium">
              {t('time')}
            </label>
            <input
              id="schedule-time"
              name="scheduleTime"
              type="time"
              step={60}
              className="min-h-11 w-full rounded-xl border bg-[var(--surface-panel)] px-3 text-sm text-[var(--content-primary)]"
              value={scheduleTime}
              disabled={scheduling}
              onChange={(event) => onTimeChange(event.target.value)}
            />
          </div>

          <p
            id="schedule-timezone-hint"
            className="text-xs leading-5 text-[var(--content-secondary)] lg:col-span-2"
          >
            {t('timeZone', { value: timeZone || t('detectingTimeZone') })}
          </p>
        </div>
      ) : null}

      {!canMutate && postVariantId ? (
        <p className="text-sm text-[var(--content-secondary)]">{t('readOnly')}</p>
      ) : null}

      {validationError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {t('futureRequired')}
        </p>
      ) : null}

      {errorStatus !== null ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {errorStatus === 503 ? t('queueUnconfirmed') : t('scheduleFailed')}
        </p>
      ) : null}

      {result ? (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {result.acceptance === 'SCHEDULED'
            ? t('scheduledSuccess', {
                value: timeFormatter.format(new Date(result.publication.scheduledAt)),
              })
            : t('alreadyAccepted', { state: result.publication.state })}
        </p>
      ) : null}

      {postVariantId && readiness?.canPublish && canMutate ? (
        <Button type="button" className="min-h-11" disabled={!canSchedule} onClick={onSchedule}>
          <Send className="mr-2 size-4" aria-hidden="true" />
          {scheduling ? t('scheduling') : t('scheduleAction')}
        </Button>
      ) : null}

      <div className="space-y-4 border-t pt-5" aria-labelledby="publication-calendar-title">
        <div>
          <p className="text-sm font-medium text-[var(--content-secondary)]">{t('calendarEyebrow')}</p>
          <h4 id="publication-calendar-title" className="mt-1 font-semibold">
            {t('calendarTitle')}
          </h4>
        </div>

        {calendarItems.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-5 text-sm text-[var(--content-secondary)]">
            {t('calendarEmpty')}
          </p>
        ) : (
          <div className="space-y-5">
            {grouped.map((group) => (
              <section key={group.dateKey} className="space-y-2" aria-label={group.label}>
                <h5 className="text-sm font-semibold">{group.label}</h5>
                <div className="space-y-2">
                  {group.items.map((publication) => {
                    const scheduled = new Date(publication.scheduledAt!);
                    const overdue = scheduled.getTime() <= Date.now();
                    return (
                      <article
                        key={publication.id}
                        className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border bg-[var(--surface-subtle)] px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{publication.destination.name}</p>
                          <p className="mt-1 flex items-center gap-2 text-sm text-[var(--content-secondary)]">
                            <Clock3 className="size-4 shrink-0" aria-hidden="true" />
                            <time dateTime={publication.scheduledAt!}>
                              {timeFormatter.format(scheduled)}
                            </time>
                          </p>
                        </div>
                        {overdue ? (
                          <p className="text-sm font-medium text-amber-800">{t('overdue')}</p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {statusesTruncated ? (
          <p className="text-xs leading-5 text-[var(--content-secondary)]">
            {t('calendarTruncated')}
          </p>
        ) : null}
      </div>
    </section>
  );
}
