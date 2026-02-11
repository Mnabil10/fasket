export function normalizeTtlSeconds(
  name: string,
  value: number | undefined,
  maxSeconds: number,
  fallbackSeconds: number,
  warn?: (message: string) => void,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallbackSeconds;
  }

  const seconds = Math.floor(numeric);
  if (seconds > maxSeconds && seconds % 1000 === 0) {
    const normalized = Math.floor(seconds / 1000);
    if (normalized > 0 && normalized <= maxSeconds) {
      if (warn) {
        warn(`${name} appears to be in milliseconds (${seconds}). Interpreting as ${normalized} seconds.`);
      }
      return normalized;
    }
  }

  return seconds;
}
