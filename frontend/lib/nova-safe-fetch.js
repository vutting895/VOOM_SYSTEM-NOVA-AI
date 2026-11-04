const RETRYABLE_STATUSES = new Set([408, 429, 502, 503, 504]);

function retryDelay(response, attempt, random) {
  const retryAfter = response?.headers?.get?.("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 5000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 5000));
  }
  const exponential = Math.min(250 * (2 ** attempt), 2000);
  return Math.round(exponential * (0.5 + random()));
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

export async function safeReadFetch(fetchImpl, input, init = {}, options = {}) {
  const method = String(init.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return fetchImpl(input, init);

  const maxRetries = Number.isInteger(options.maxRetries)
    ? Math.max(0, Math.min(options.maxRetries, 2))
    : 2;
  const maxElapsedMs = Number.isFinite(options.maxElapsedMs)
    ? Math.max(0, Math.min(options.maxElapsedMs, 10000))
    : 10000;
  const now = options.now || Date.now;
  const random = options.random || Math.random;
  const sleep = options.sleep || wait;
  const startedAt = now();
  let attempt = 0;

  while (true) {
    if (init.signal?.aborted) throw init.signal.reason || new DOMException("Aborted", "AbortError");
    let response;
    try {
      response = await fetchImpl(input, init);
    } catch (error) {
      if (attempt >= maxRetries || now() - startedAt >= maxElapsedMs || init.signal?.aborted) throw error;
      const delay = Math.min(250 * (2 ** attempt), 2000);
      if (now() - startedAt + delay > maxElapsedMs) throw error;
      await sleep(Math.round(delay * (0.5 + random())), init.signal);
      attempt += 1;
      continue;
    }

    if (!RETRYABLE_STATUSES.has(response.status) || attempt >= maxRetries) return response;
    const delay = retryDelay(response, attempt, random);
    if (now() - startedAt + delay > maxElapsedMs) return response;
    await sleep(delay, init.signal);
    attempt += 1;
  }
}
