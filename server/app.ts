import { Hono } from "hono";
import { cors } from "hono/cors";

import { auth } from "./auth/auth.js";
import { authTrustedOrigins } from "./auth/origins.js";
import { permissionForRequest } from "./auth/permissions.js";
import { createDb, probeDatabase, type Database } from "./db/index.js";
import type { ServerEnv } from "./env.js";
import { loadEnv } from "./env.js";
import { accessDeniedMessage } from "./lib/brand.js";
import { runWithAuditRequestContext } from "./lib/audit-request-context.js";
import {
  captureDatabaseFailures,
  DatabaseUnavailableError,
  peekDatabaseFailure,
  publicApiError,
} from "./lib/db-errors.js";
import { auditRequestContextFromHeaders } from "./lib/request-context.js";
import { safeErrorLabel, logStartup } from "./lib/startup-log.js";
import { getSessionUser } from "./lib/session.js";
import { probeRedis } from "./queue/connection.js";
import {
  isApiPathAllowedDuringPasswordChange,
  isApiPathAllowedDuringTwoFactorSetup,
  loadAccountSecurityState,
} from "./lib/account-security.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerActivityRoutes } from "./routes/activity.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { recordAccessDeniedAudit } from "./services/access-denied-audit.js";
import { recordApiMutationAudit } from "./services/api-mutation-audit.js";
import { recordAuthHandlerAudit } from "./services/auth-event-audit.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerContactImportRoutes } from "./routes/contact-import.js";
import { registerContactListRoutes } from "./routes/contact-lists.js";
import { registerContactRoutes } from "./routes/contacts.js";
import { registerDraftRoutes } from "./routes/drafts.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMailRoutes } from "./routes/mail.js";
import { registerQueueRoutes } from "./routes/queue.js";
import { registerSuppressionRoutes } from "./routes/suppressions.js";
import { seedAccessControl, userHasPermission } from "./services/access-control.js";

export type SendStackApp = {
  app: Hono;
  db: Database;
};

export type CreateAppOptions = {
  /** Persist system roles. Long-running server only — never on the Vercel request path. */
  seedAccess?: boolean;
};

export function createSendStackApp(env: ServerEnv, options: CreateAppOptions = {}): SendStackApp {
  const { db } = createDb(env);
  const app = new Hono();

  const allowedBrowserOrigins = new Set(authTrustedOrigins(env.FRONTEND_URL));

  app.use(
    "/api/*",
    cors({
      origin: (origin) =>
        origin && allowedBrowserOrigins.has(origin) ? origin : env.FRONTEND_URL,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  app.use("/api/*", async (c, next) => {
    const requestContext = auditRequestContextFromHeaders(c.req.raw.headers);
    c.header("x-request-id", requestContext.requestId);
    const started = Date.now();
    return runWithAuditRequestContext(requestContext, async () => {
      await next();
      try {
        await recordApiMutationAudit({
          db,
          method: c.req.method,
          path: c.req.path,
          status: c.res.status,
          durationMs: Date.now() - started,
          headers: c.req.raw.headers,
          requestContext,
        });
      } catch (error) {
        console.error("[api-mutation-audit]", safeErrorLabel(error));
      }
    });
  });

  app.use("/api/*", async (c, next) => {
    if (
      c.req.path.startsWith("/api/auth") ||
      c.req.path === "/api/health" ||
      c.req.path === "/api/ping"
    ) {
      return next();
    }
    let account;
    try {
      account = await getSessionUser(c.req.raw.headers);
    } catch (error) {
      if (error instanceof DatabaseUnavailableError) {
        const mapped = publicApiError(error);
        console.error(mapped.log);
        return c.json(mapped.body, mapped.status);
      }
      throw error;
    }
    if (account && (account as { banned?: boolean | null }).banned) {
      return c.json({ error: accessDeniedMessage() }, 403);
    }
    if (account) {
      const security = await loadAccountSecurityState(db, account.id);
      if (security?.mustChangePassword && !isApiPathAllowedDuringPasswordChange(c.req.path, c.req.method)) {
        return c.json(
          { error: "Change your password before continuing.", code: "PASSWORD_CHANGE_REQUIRED" },
          403,
        );
      }
      if (
        security?.twoFactorEnforcementRequired &&
        !isApiPathAllowedDuringTwoFactorSetup(c.req.path, c.req.method)
      ) {
        return c.json(
          {
            error: "Configure two-factor authentication before continuing.",
            code: "TWO_FACTOR_SETUP_REQUIRED",
          },
          403,
        );
      }
    }
    const permission = permissionForRequest(c.req.path, c.req.method);
    if (!permission) return next();
    if (!account) return c.json({ error: "Unauthorized" }, 401);
    const allowed = await userHasPermission(db, account, permission);
    if (!allowed) {
      void recordAccessDeniedAudit(db, {
        actorUserId: account.id,
        actorEmail: account.email,
        permission,
        path: c.req.path,
        headers: c.req.raw.headers,
      });
      return c.json({ error: "You do not have permission to do that." }, 403);
    }
    return next();
  });

  registerHealthRoutes(app, {
    probeDatabase: () => probeDatabase(env.DATABASE_URL),
    probeRedis,
  });
  registerAccountRoutes(app);
  registerActivityRoutes(app);
  registerAdminRoutes(app);
  registerDraftRoutes(app);
  registerContactRoutes(app);
  registerContactListRoutes(app);
  registerContactImportRoutes(app);
  registerSuppressionRoutes(app);
  registerCampaignRoutes(app);
  registerQueueRoutes(app);
  registerMailRoutes(app);

  app.all("/api/auth/*", async (c) => {
    const outcome = await captureDatabaseFailures(async () => {
      const response = await auth.handler(c.req.raw);
      return { response, failure: peekDatabaseFailure() };
    });
    let response = outcome.response;
    if (outcome.failure && response.status >= 500) {
      console.error(
        `[auth] infrastructure failure kind=${outcome.failure.kind} response=database_unavailable`,
      );
      c.header("Cache-Control", "no-store");
      response = c.json(
        { error: "Database is temporarily unavailable.", code: "database_unavailable" },
        503,
      );
    }
    try {
      await recordAuthHandlerAudit({
        db,
        path: c.req.path,
        method: c.req.method,
        status: response.status,
        headers: c.req.raw.headers,
      });
    } catch (error) {
      console.error("[auth-audit]", safeErrorLabel(error));
    }
    return response;
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.onError((error, c) => {
    const mapped = publicApiError(error);
    console.error(mapped.log);
    return c.json(mapped.body, mapped.status);
  });

  const seedAccess = options.seedAccess ?? !process.env.VERCEL;
  if (seedAccess) {
    logStartup("Access control seed started");
    seedAccessControl(db).catch((error) => {
      console.error("[admin] access control seed failed", safeErrorLabel(error));
    });
  } else {
    logStartup("Access control seed skipped");
  }

  logStartup("Hono initialized");
  return { app, db };
}

let cachedApp: Hono | undefined;

/** Singleton Hono app for Vercel serverless (warm invocations reuse the instance). */
export function getSendStackApp(): Hono {
  if (!cachedApp) {
    cachedApp = createSendStackApp(loadEnv(), { seedAccess: false }).app;
  }
  return cachedApp;
}
