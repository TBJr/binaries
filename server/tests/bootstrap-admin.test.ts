import { describe, expect, it, vi } from "vitest";

import {
  generateTemporaryPassword,
  resolveBootstrapPassword,
  validateBootstrapPassword,
} from "../lib/bootstrap-password.js";
import {
  bootstrapPreflight,
  formatBootstrapBanner,
  runBootstrapAdmin,
  BOOTSTRAP_SUPER_ADMIN_ROLE,
} from "../services/bootstrap-admin.js";

vi.mock("../mail/lock.js", () => ({
  withPgAdvisoryLock: async <T>(_db: unknown, _name: string, task: () => Promise<T>) => task(),
}));

describe("bootstrap password", () => {
  it("generates high-entropy temporary passwords", () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(b.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/\s/);
  });

  it("uses env password when provided and validates strength", () => {
    const weak = resolveBootstrapPassword({ BOOTSTRAP_ADMIN_PASSWORD: "short" });
    expect(weak.error).toBeTruthy();
    expect(weak.password).toBe("");

    const strong = resolveBootstrapPassword({ BOOTSTRAP_ADMIN_PASSWORD: "valid-bootstrap-password" });
    expect(strong.error).toBeNull();
    expect(strong.generated).toBe(false);
    expect(strong.password).toBe("valid-bootstrap-password");
  });

  it("generates when BOOTSTRAP_ADMIN_PASSWORD is absent", () => {
    const resolved = resolveBootstrapPassword({});
    expect(resolved.generated).toBe(true);
    expect(resolved.error).toBeNull();
    expect(resolved.password.length).toBeGreaterThanOrEqual(32);
  });

  it("validateBootstrapPassword rejects empty", () => {
    expect(validateBootstrapPassword("")).toMatch(/at least 8/);
  });
});

describe("bootstrapPreflight", () => {
  it("proceeds when database is empty", () => {
    expect(bootstrapPreflight([], "admin@example.com")).toEqual({ action: "proceed" });
  });

  it("skips when bootstrap email already exists", () => {
    expect(
      bootstrapPreflight(
        [{ email: "admin@example.com", role: "user", banned: false }],
        "admin@example.com",
      ),
    ).toEqual({ action: "skip", reason: "email_exists", email: "admin@example.com" });
  });

  it("does not elevate an existing non-admin email match", () => {
    const result = bootstrapPreflight(
      [{ email: "admin@example.com", role: "user", banned: false }],
      "admin@example.com",
    );
    expect(result.action).toBe("skip");
  });

  it("refuses when another super-admin already exists", () => {
    expect(
      bootstrapPreflight(
        [{ email: "other@example.com", role: "super-admin", banned: false }],
        "admin@example.com",
      ),
    ).toEqual({ action: "refuse", reason: "already_initialized" });
  });

  it("ignores banned super-admins for initialization guard", () => {
    expect(
      bootstrapPreflight(
        [{ email: "other@example.com", role: "super-admin", banned: true }],
        "admin@example.com",
      ),
    ).toEqual({ action: "proceed" });
  });
});

describe("formatBootstrapBanner", () => {
  it("includes generated password only on success", () => {
    const banner = formatBootstrapBanner({
      status: "success",
      email: "admin@example.com",
      name: "Administrator",
      role: BOOTSTRAP_SUPER_ADMIN_ROLE,
      temporaryPassword: "TEMP-SECRET-VALUE",
      loginUrl: "http://localhost:5173",
    });
    expect(banner).toContain("TEMP-SECRET-VALUE");
    expect(banner).toContain("Status: SUCCESS");
  });

  it("does not print passwords on failure", () => {
    const banner = formatBootstrapBanner({
      status: "error",
      message: "Better Auth did not return a created user.",
    });
    expect(banner).toContain("Status: FAILED");
    expect(banner).not.toContain("TEMP-SECRET");
  });

  it("reports skipped state", () => {
    const banner = formatBootstrapBanner({
      status: "skipped",
      reason: "email_exists",
      email: "admin@example.com",
    });
    expect(banner).toContain("Status: SKIPPED");
  });
});

describe("runBootstrapAdmin", () => {
  function buildMockDb(options: {
    users?: Array<{ email: string; role: string | null; banned: boolean | null }>;
    credentialPassword?: string | null;
  }) {
    const users = options.users ?? [];
    const credentialPassword =
      options.credentialPassword ?? "$2a$10$hashedpasswordvalueislongenough";

    let selectCall = 0;
    const db = {
      select: vi.fn(() => db),
      from: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return Promise.resolve(users);
        }
        return db;
      }),
      where: vi.fn(() => db),
      limit: vi.fn(async () => {
        if (selectCall === 2) {
          return [
            {
              id: "user_1",
              email: "admin@example.com",
              emailVerified: true,
              role: BOOTSTRAP_SUPER_ADMIN_ROLE,
              name: "Administrator",
            },
          ];
        }
        if (selectCall === 3) {
          return [{ password: credentialPassword }];
        }
        if (selectCall === 4) {
          return [{ mustChangePassword: true }];
        }
        return [];
      }),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(async () => undefined),
        })),
      })),
      transaction: vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
      execute: vi.fn(async () => undefined),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
    };

    return db;
  }

  it("creates administrator with generated temporary password", async () => {
    const db = buildMockDb({ users: [] });
    const signUpEmail = vi.fn(async () => ({ user: { id: "user_1" } }));

    const outcome = await runBootstrapAdmin({
      db: db as never,
      email: "admin@example.com",
      displayName: "Administrator",
      loginUrl: "http://localhost:5173",
      signUpEmail,
      env: {},
    });

    expect(outcome.status).toBe("success");
    if (outcome.status === "success") {
      expect(outcome.role).toBe(BOOTSTRAP_SUPER_ADMIN_ROLE);
      expect(outcome.temporaryPassword).toBeTruthy();
      expect(outcome.temporaryPassword!.length).toBeGreaterThanOrEqual(32);
    }
    expect(signUpEmail).toHaveBeenCalledOnce();
    if (outcome.status === "success") {
      expect(signUpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "admin@example.com",
          password: outcome.temporaryPassword,
        }),
      );
    }
  });

  it("skips when email exists without calling signUp", async () => {
    const signUpEmail = vi.fn();
    const outcome = await runBootstrapAdmin({
      db: buildMockDb({
        users: [{ email: "admin@example.com", role: "user", banned: false }],
      }) as never,
      email: "admin@example.com",
      displayName: "Administrator",
      loginUrl: "http://localhost:5173",
      signUpEmail,
    });

    expect(outcome).toEqual({
      status: "skipped",
      reason: "email_exists",
      email: "admin@example.com",
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("refuses when bootstrap already initialized", async () => {
    const outcome = await runBootstrapAdmin({
      db: buildMockDb({
        users: [{ email: "existing@example.com", role: "super-admin", banned: false }],
      }) as never,
      email: "admin@example.com",
      displayName: "Administrator",
      loginUrl: "http://localhost:5173",
      signUpEmail: vi.fn(),
    });

    expect(outcome.status).toBe("refused");
  });

  it("returns error when signUp fails without success password output", async () => {
    const outcome = await runBootstrapAdmin({
      db: buildMockDb({ users: [] }) as never,
      email: "admin@example.com",
      displayName: "Administrator",
      loginUrl: "http://localhost:5173",
      signUpEmail: async () => ({}),
      env: {},
    });

    expect(outcome.status).toBe("error");
    const banner = formatBootstrapBanner(outcome);
    expect(banner).not.toMatch(/[A-Za-z0-9_-]{32,}/);
  });

  it("rejects invalid credential hash length", async () => {
    const outcome = await runBootstrapAdmin({
      db: buildMockDb({ users: [], credentialPassword: "short" }) as never,
      email: "admin@example.com",
      displayName: "Administrator",
      loginUrl: "http://localhost:5173",
      signUpEmail: async () => ({ user: { id: "user_1" } }),
      env: { BOOTSTRAP_ADMIN_PASSWORD: "configured-password-value" },
    });

    expect(outcome.status).toBe("error");
  });

  it("does not change account on second run (skipped)", async () => {
    const signUpEmail = vi.fn();
    const db = buildMockDb({
      users: [{ email: "admin@example.com", role: BOOTSTRAP_SUPER_ADMIN_ROLE, banned: false }],
    });

    const outcome = await runBootstrapAdmin({
      db: db as never,
      email: "admin@example.com",
      displayName: "Administrator",
      loginUrl: "http://localhost:5173",
      signUpEmail,
    });

    expect(outcome.status).toBe("skipped");
    expect(signUpEmail).not.toHaveBeenCalled();
  });
});
