import { format } from 'date-fns';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The athlete's own calendar day as yyyy-MM-dd, for fields saved as a plain date.
 * Never use toISOString() for these: it gives the UTC day, which is already tomorrow
 * on a US evening (after 7 PM Eastern).
 */
export function toDateOnly(value: Date | string): string {
  if (typeof value === 'string' && DATE_ONLY.test(value)) return value;
  return format(new Date(value), 'yyyy-MM-dd');
}

/** A Date for that calendar day. Plain yyyy-MM-dd strings are read as local noon, not UTC midnight. */
export function toLocalDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  if (DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }
  return new Date(value);
}
