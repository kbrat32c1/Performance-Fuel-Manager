/**
 * The calendar day the coach view should show food and water for.
 *
 * Servers run in UTC, so `new Date().toISOString()` flips to tomorrow at 8pm in
 * Connecticut. The coach's browser sends its own local date; we accept it only
 * when it is within a day of now (so it can't be used to page through history),
 * and otherwise fall back to the team's timezone.
 */
export const TEAM_TIMEZONE = "America/New_York";

export function localDateIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function resolveShareDate(requested: unknown, now: Date = new Date()): string {
  const fallback = localDateIn(TEAM_TIMEZONE, now);
  if (typeof requested !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return fallback;
  const asUtcNoon = Date.parse(`${requested}T12:00:00Z`);
  if (Number.isNaN(asUtcNoon)) return fallback;
  // Every real timezone's "today" is within ~26h of UTC noon today.
  const utcNoonToday = Date.parse(`${now.toISOString().slice(0, 10)}T12:00:00Z`);
  return Math.abs(asUtcNoon - utcNoonToday) <= 36 * 3600 * 1000 ? requested : fallback;
}
