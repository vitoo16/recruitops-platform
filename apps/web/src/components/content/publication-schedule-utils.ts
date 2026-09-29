import type { PublicationStatusRecord } from '@recruitops/contracts';

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})$/;

export function localDateValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localScheduleToIso(dateValue: string, timeValue: string): string | null {
  const dateMatch = datePattern.exec(dateValue);
  const timeMatch = timePattern.exec(timeValue);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

  const local = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute
  ) {
    return null;
  }

  return local.toISOString();
}

export function scheduledPublications(
  items: readonly PublicationStatusRecord[],
): PublicationStatusRecord[] {
  return items
    .filter((item) => item.state === 'SCHEDULED' && item.scheduledAt !== null)
    .slice()
    .sort((left, right) => {
      const leftTime = left.scheduledAt ? Date.parse(left.scheduledAt) : 0;
      const rightTime = right.scheduledAt ? Date.parse(right.scheduledAt) : 0;
      return leftTime - rightTime;
    });
}
