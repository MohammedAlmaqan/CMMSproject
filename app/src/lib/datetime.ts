/**
 * ISO timestamp -> the value an `<input type="datetime-local">` expects, in the
 * viewer's local time. Slicing the ISO string instead would show UTC and then
 * save the shifted time back, so a supervisor in UTC+3 would see their 08:00
 * plan as 05:00 and every edit would move it another three hours.
 */
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
