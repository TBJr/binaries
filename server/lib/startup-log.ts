const startedAt = Date.now();

const URL_IN_TEXT = /(?:postgres(?:ql)?:\/\/|rediss?:\/\/)\S+/gi;

export function logStartup(stage: string) {
  console.info(`[startup] ${stage} +${Date.now() - startedAt}ms`);
}

/** Log text safe for logs: no database URLs, Redis URLs, or credential-shaped text. */
export function safeLogText(value: string) {
  const message = value.replace(URL_IN_TEXT, "[url]").replace(/\s+/g, " ").trim();
  if (/password|secret|token|api[_-]?key|@/i.test(message)) return "[redacted]";
  return message.slice(0, 200);
}

/** Error text safe for logs: no database URLs, Redis URLs, or credential-shaped text. */
export function safeErrorLabel(error: unknown) {
  if (!(error instanceof Error)) return "Error";
  const message = error.message.replace(URL_IN_TEXT, "[url]").replace(/\s+/g, " ").trim();
  if (/password|secret|token|api[_-]?key|@/i.test(message)) return error.name;
  const compact = message.slice(0, 160);
  return compact ? `${error.name}: ${compact}` : error.name;
}

export async function withDeadline<T>(work: Promise<T>, ms: number, fallback: T, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guarded = work.catch((error: unknown) => {
    console.error(`[health] ${label}`, safeErrorLabel(error));
    return fallback;
  });
  try {
    return await Promise.race([
      guarded,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.error(`[health] ${label} timed out`);
          resolve(fallback);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class DeadlineExceededError extends Error {
  readonly label: string;

  constructor(label: string) {
    super(`${label} timed out`);
    this.name = "DeadlineExceededError";
    this.label = label;
  }
}

/** Reject when work does not settle before `ms` (used for request-path DB/auth). */
export async function withRejectingDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          console.error(`[deadline] ${label} timed out after ${ms}ms`);
          reject(new DeadlineExceededError(label));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
