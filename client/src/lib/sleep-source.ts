/** "from WHOOP", "from V5 band", "from Apple Health" — plus the date when it isn't last night's. */
export function sleepSourceName(source: string | null | undefined, date: string, todayStr: string): string {
  const name = source === 'whoop' ? 'WHOOP' : source === 'v5-direct' ? 'V5 band' : source === 'healthkit' ? 'Apple Health' : 'your wearable';
  if (date === todayStr) return `from ${name}`;
  const [, m, d] = date.split('-').map(Number);
  return `from ${name} · ${m}/${d}`;
}
