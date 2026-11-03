import type { Hono } from "hono";

import { getApiServiceId } from "../lib/brand.js";
import { logStartup, withDeadline } from "../lib/startup-log.js";

export type HealthProbes = {
  probeDatabase: () => Promise<"ok" | "unavailable">;
  probeRedis: () => Promise<"ok" | "unavailable" | "disabled">;
};

type HealthLimits = {
  databaseMs?: number;
  redisMs?: number;
};

export function registerHealthRoutes(app: Hono, probes: HealthProbes, limits: HealthLimits = {}) {
  const databaseMs = limits.databaseMs ?? 6_000;
  const redisMs = limits.redisMs ?? 5_000;
  const service = getApiServiceId();

  app.get("/api/ping", (c) => {
    logStartup("Ping handler entered");
    c.header("Cache-Control", "no-store");
    logStartup("Response returned");
    return c.json({ ok: true, service });
  });

  app.get("/api/health", async (c) => {
    logStartup("Health handler entered");
    c.header("Cache-Control", "no-store");

    logStartup("Database check started");
    const database = await withDeadline(
      probes.probeDatabase(),
      databaseMs,
      "unavailable",
      "database",
    );
    logStartup("Database check finished");

    logStartup("Redis check started");
    const redis = await withDeadline(probes.probeRedis(), redisMs, "unavailable", "redis");
    logStartup("Redis check finished");

    const connected = database === "ok";
    logStartup("Response returned");
    return c.json(
      {
        ok: connected,
        status: connected ? "ok" : "degraded",
        database: connected ? "connected" : "unavailable",
        service,
        checks: { api: "ok", database, redis },
        timestamp: new Date().toISOString(),
      },
      connected ? 200 : 503,
    );
  });
}
