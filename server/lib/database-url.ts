export type DatabaseTarget = {
  protocol: "postgres" | "postgresql";
  host: string;
  port: string;
  database: string;
  sslmode: string | null;
  pooled: boolean;
  local: boolean;
  neon: boolean;
};

export type DatabaseUrlStatus = "VALID" | "MISSING" | "INVALID";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function parseDatabaseTarget(databaseUrl: string): DatabaseTarget | null {
  const trimmed = databaseUrl.trim();
  const protocol = trimmed.split(":")[0]?.toLowerCase();
  if (protocol !== "postgres" && protocol !== "postgresql") return null;
  try {
    const url = new URL(trimmed.replace(/^postgres(ql)?:/i, "http:"));
    if (!url.hostname) return null;
    const sslmode = url.searchParams.get("sslmode");
    return {
      protocol,
      host: url.hostname,
      port: url.port || "5432",
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      sslmode,
      pooled: url.hostname.includes("-pooler") || url.hostname.includes("pooler."),
      local: LOCAL_HOSTS.has(url.hostname),
      neon: url.hostname.endsWith(".neon.tech"),
    };
  } catch {
    return null;
  }
}

/** Safe one-line description. Never includes the username, password, or full URL. */
export function describeDatabaseTarget(databaseUrl: string) {
  const target = parseDatabaseTarget(databaseUrl);
  if (!target) return "invalid";
  const database = target.database || "unset";
  const sslmode = target.sslmode ?? "unset";
  return `set host=${target.host} port=${target.port} db=${database} sslmode=${sslmode} pooled=${target.pooled ? "yes" : "no"}`;
}

export function validateDatabaseUrl(databaseUrl: string | undefined): {
  status: DatabaseUrlStatus;
  detail: string;
} {
  if (!databaseUrl?.trim()) {
    return { status: "MISSING", detail: "DATABASE_URL is required" };
  }
  const target = parseDatabaseTarget(databaseUrl);
  if (!target) {
    return {
      status: "INVALID",
      detail: "Use a postgres:// or postgresql:// URL with a host",
    };
  }
  if (target.neon && target.sslmode !== "require" && target.sslmode !== "verify-full" && target.sslmode !== "verify-ca") {
    return {
      status: "INVALID",
      detail: "Neon connections need sslmode=require (or verify-full / verify-ca)",
    };
  }
  const kind = target.neon ? "neon" : target.local ? "local" : "custom";
  return {
    status: "VALID",
    detail: `${describeDatabaseTarget(databaseUrl)} kind=${kind}`,
  };
}
