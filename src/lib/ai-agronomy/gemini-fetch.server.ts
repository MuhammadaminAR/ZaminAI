/** One bounded retry for pre-stream transient HTTP failures only. Never replay a stream. */
export function createGeminiFetch(
  fetcher: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): typeof fetch {
  return async (input, init) => {
    const response = await fetcher(input, init);
    if (![500, 502, 503, 504].includes(response.status)) return response;
    const header = response.headers.get("retry-after");
    const seconds = header ? Number(header) : NaN;
    const delay = header
      ? Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now()
      : 2000 + Math.random() * 1000;
    // Long waits require a fresh user action, not queued requests holding the connection.
    if (!Number.isFinite(delay) || delay < 0 || delay > 10_000) return response;
    await response.body?.cancel();
    await wait(Math.max(2000, delay));
    return fetcher(input, init);
  };
}