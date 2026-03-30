/**
 * Convert a UTC date to a local datetime-local input string (YYYY-MM-DDTHH:mm).
 */
export function convertUTCToLocal(utcDate: Date | string | null): string {
  if (!utcDate) return '';
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Convert a datetime-local input string to a UTC ISO string.
 */
export function convertLocalToUTC(localDateString: string): string {
  if (!localDateString) return '';
  const date = new Date(localDateString);
  if (isNaN(date.getTime())) return '';
  return date.toISOString();
}
