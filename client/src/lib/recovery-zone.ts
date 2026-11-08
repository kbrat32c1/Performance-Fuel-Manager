/** Recovery label, color tone and data source for the Today screen. No store or network imports. */

type SourceRow = { source?: string | null };

export type RecoveryTone = "good" | "watch" | "low";

/** Short label and color tone for a recovery score, same bands as the Recovery card. */
export function recoveryZone(score: number): { label: string; tone: RecoveryTone } {
  const label = score >= 80 ? "Excellent recovery"
    : score >= 65 ? "Good recovery"
    : score >= 45 ? "Moderate recovery"
    : score >= 30 ? "Low recovery"
    : "Poor recovery";
  const tone: RecoveryTone = score >= 80 ? "good" : score >= 40 ? "watch" : "low";
  return { label, tone };
}

/** Where a day's health data came from, in plain words. */
export function recoverySourceLabel(h: SourceRow): string {
  const s = h.source as string;
  if (s === "whoop") return "From WHOOP";
  if (s === "v5-direct") return "From your band";
  if (s === "healthkit") return "From Apple Health";
  return "Entered by you";
}

/** One word for the tile: "Low", "Good", … */
export function recoveryWord(score: number): string {
  return recoveryZone(score).label.split(" ")[0];
}

/** Short source name for a tile: "WHOOP", "Band", "Apple Health", "Manual". */
export function recoverySourceShort(h: SourceRow): string {
  const s = h.source as string;
  if (s === "whoop") return "WHOOP";
  if (s === "v5-direct") return "Band";
  if (s === "healthkit") return "Apple Health";
  return "Manual";
}
