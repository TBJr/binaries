import { AsyncLocalStorage } from "node:async_hooks";

import { safeErrorLabel } from "./startup-log.js";

export type DatabaseFailureKind =
  | "timeout"
  | "refused"
  | "dns"
  | "reset"
  | "unreachable"
  | "unavailable";

export type DatabaseFailure = {
  kind: DatabaseFailureKind;
  code?: string;
};

const NETWORK_KIND: Record<string, DatabaseFailureKind> = {
  ETIMEDOUT: "timeout",
  CONNECT_TIMEOUT: "timeout",
  ECONNREFUSED: "refused",
  ENOTFOUND: "dns",
  EAI_AGAIN: "dns",
  EAI_NODATA: "dns",
  ECONNRESET: "reset",
  EPIPE: "reset",
  CONNECTION_CLOSED: "reset",
  CONNECTION_ENDED: "reset",
  CONNECTION_DESTROYED: "reset",
  EHOSTUNREACH: "unreachable",
  ENETUNREACH: "unreachable",
};

/** PostgreSQL SQLSTATEs that mean the server cannot take a connection. */
const SQLSTATE_UNAVAILABLE = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "57P01",
  "57P02",
  "57P03",
  "53300",
]);

const SQLSTATE_AUTHENTICATION = new Set(["28P01", "28000"]);

type FailureStore = { failure: DatabaseFailure | null };

const failureStore = new AsyncLocalStorage<FailureStore>();

export class DatabaseUnavailableError extends Error {
  readonly kind: DatabaseFailureKind;

  constructor(kind: DatabaseFailureKind) {
    super("Database is temporarily unavailable.");
    this.name = "DatabaseUnavailableError";
    this.kind = kind;
  }
}

export function captureDatabaseFailures<T>(work: () => Promise<T>): Promise<T> {
  return failureStore.run({ failure: null }, work);
}

export function noteDatabaseFailure(failure: DatabaseFailure) {
  const store = failureStore.getStore();
  if (store && !store.failure) store.failure = failure;
}

export function peekDatabaseFailure() {
  return failureStore.getStore()?.failure ?? null;
}

function readCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code ? code : undefined;
}

function safeDiagnosticValue(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.-]{1,80}$/.test(value)) return undefined;
  return value;
}

function postgresDiagnostics(error: unknown): {
  code?: string;
  severity?: string;
  schema?: string;
  table?: string;
  column?: string;
  constraint?: string;
} | null {
  if (!error || typeof error !== "object") return null;
  if (error instanceof AggregateError) {
    for (const nested of error.errors) {
      const diagnostics = postgresDiagnostics(nested);
      if (diagnostics) return diagnostics;
    }
    return null;
  }

  const candidate = error as Record<string, unknown>;
  const code = safeDiagnosticValue(candidate.code);
  const diagnostics = {
    ...(code && isSqlState(code) ? { code } : {}),
    ...(safeDiagnosticValue(candidate.severity) ? { severity: safeDiagnosticValue(candidate.severity) } : {}),
    ...(safeDiagnosticValue(candidate.schema) ? { schema: safeDiagnosticValue(candidate.schema) } : {}),
    ...(safeDiagnosticValue(candidate.table) ? { table: safeDiagnosticValue(candidate.table) } : {}),
    ...(safeDiagnosticValue(candidate.column) ? { column: safeDiagnosticValue(candidate.column) } : {}),
    ...(safeDiagnosticValue(candidate.constraint) ? { constraint: safeDiagnosticValue(candidate.constraint) } : {}),
  };
  if (Object.keys(diagnostics).length > 0) return diagnostics;
  if (error instanceof Error && error.cause) return postgresDiagnostics(error.cause);
  return null;
}

export function databaseErrorLogLabel(error: unknown) {
  const diagnostics = postgresDiagnostics(error);
  if (!diagnostics?.code) return safeErrorLabel(error);
  return [
    `[database] query failed sqlstate=${diagnostics.code}`,
    `severity=${diagnostics.severity ?? "unknown"}`,
    ...(["schema", "table", "column", "constraint"] as const)
      .filter((key) => diagnostics[key])
      .map((key) => `${key}=${diagnostics[key]}`),
  ].join(" ");
}

function isSqlState(code: string) {
  return /^[0-9A-Z]{5}$/.test(code);
}

export function isPostgresAuthenticationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (error instanceof AggregateError) {
    return error.errors.some((item) => isPostgresAuthenticationError(item));
  }
  const code = readCode(error);
  if (code && SQLSTATE_AUTHENTICATION.has(code)) return true;
  if (error instanceof Error && error.cause) return isPostgresAuthenticationError(error.cause);
  return false;
}

export function classifyDatabaseError(error: unknown): DatabaseFailure | null {
  if (!error || typeof error !== "object") return null;
  if (error instanceof DatabaseUnavailableError) {
    return { kind: error.kind, code: "database_unavailable" };
  }
  if (error instanceof AggregateError) {
    const nested = error.errors
      .map((item) => classifyDatabaseError(item))
      .filter((item): item is DatabaseFailure => item !== null);
    if (nested.length > 0) {
      return nested.find((item) => item.kind === "timeout") ?? nested[0] ?? null;
    }
  }

  const code = readCode(error);
  if (code && isSqlState(code)) {
    if (SQLSTATE_UNAVAILABLE.has(code)) return { kind: "unavailable", code };
    return null;
  }
  if (code && NETWORK_KIND[code]) return { kind: NETWORK_KIND[code], code };

  if (error instanceof Error && error.cause) {
    const cause = classifyDatabaseError(error.cause);
    if (cause) return cause;
  }

  if (!(error instanceof Error)) return null;
  if (/ETIMEDOUT|connect timeout|CONNECT_TIMEOUT/i.test(error.message)) {
    return { kind: "timeout", code: code ?? "ETIMEDOUT" };
  }
  if (/ECONNREFUSED/i.test(error.message)) return { kind: "refused", code: code ?? "ECONNREFUSED" };
  if (/ENOTFOUND|EAI_AGAIN/i.test(error.message)) return { kind: "dns", code };
  if (/connection terminated|connection ended|CONNECTION_CLOSED/i.test(error.message)) {
    return { kind: "reset", code: code ?? "CONNECTION_CLOSED" };
  }
  return null;
}

export function databaseUnavailableBody() {
  return {
    error: "Database is temporarily unavailable.",
    code: "database_unavailable" as const,
  };
}

export function publicApiError(error: unknown): {
  status: 500 | 503;
  body: { error: string; code?: "database_unavailable" };
  log: string;
} {
  const failure = classifyDatabaseError(error);
  if (failure) {
    return {
      status: 503,
      body: databaseUnavailableBody(),
      log: `[database] unavailable kind=${failure.kind} code=${failure.code ?? "none"} ${safeErrorLabel(error)}`,
    };
  }
  if (isPostgresAuthenticationError(error)) {
    return {
      status: 500,
      body: { error: "Internal server error" },
      log: "[database] authentication rejected by server",
    };
  }
  const diagnostics = postgresDiagnostics(error);
  if (diagnostics?.code) {
    return {
      status: 500,
      body: { error: "Internal server error" },
      log: databaseErrorLogLabel(error),
    };
  }
  return {
    status: 500,
    body: { error: "Internal server error" },
    log: `[api] ${safeErrorLabel(error)}`,
  };
}
