const SESSION_PATH = "/api/auth/get-session";

type FetchInput = Parameters<typeof fetch>[0];

function requestUrl(input: FetchInput) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function nextInput(input: FetchInput) {
  return input instanceof Request ? input.clone() : input;
}

function shouldRetryStatus(status: number) {
  return status === 500 || status === 502 || status === 503;
}

/**
 * In development, the session check can run before the API is listening.
 * Retry only that read-only request. Production uses a single attempt.
 */
export async function fetchWithStartupRetry(
  input: FetchInput,
  init: RequestInit | undefined,
  options: {
    dev: boolean;
    fetchImpl?: typeof fetch;
    delayMs?: number;
    attempts?: number;
  },
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retry = options.dev && requestUrl(input).includes(SESSION_PATH);
  const attempts = retry ? (options.attempts ?? 8) : 1;
  const delayMs = options.delayMs ?? 250;
  let lastResponse: Response | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(nextInput(input), init);
      if (!retry || attempt === attempts || !shouldRetryStatus(response.status)) {
        return response;
      }
      lastResponse = response;
      await response.body?.cancel?.();
    } catch (error) {
      if (!retry || attempt === attempts) throw error;
    }
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return lastResponse ?? fetchImpl(nextInput(input), init);
}
