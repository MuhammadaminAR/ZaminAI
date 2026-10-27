/** Mapbox tile errors are not evidence that the style or entire map failed. */
export function mapFailureKind(error: { url?: string }, sourceId?: string): "partial" | "fatal" {
  return sourceId || /\/(?:v4|v5)\/|\/(?:tiles|satellite)\//.test(error.url ?? "") ? "partial" : "fatal";
}

/** Manual retries only; honor Retry-After if a future SDK exposes it. */
export function mapRetryDelay(failures: number, retryAfter?: string | null, now = Date.now()): number {
  const backoff = Math.min(300_000, 60_000 * 2 ** Math.min(3, Math.max(0, failures - 1)));
  if (!retryAfter) return backoff;
  const seconds = Number(retryAfter);
  const provided = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
  return Number.isFinite(provided) ? Math.max(backoff, provided) : backoff;
}