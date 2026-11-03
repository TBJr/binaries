import { describe, expect, it } from "vitest";

import { auditActionLabel, categoryForAction } from "../lib/audit-taxonomy.js";
import { sanitizeAuditMetadata } from "../lib/security-audit.js";
import { auditListQuerySchema } from "../services/audit-log.js";

describe("audit taxonomy", () => {
  it("labels known actions", () => {
    expect(auditActionLabel("password_changed")).toBe("Password changed");
  });

  it("maps categories from actions", () => {
    expect(categoryForAction("draft_created")).toBe("DRAFT");
    expect(categoryForAction("campaign_simulation_requested")).toBe("CAMPAIGN");
    expect(categoryForAction("page_viewed")).toBe("ACTIVITY");
  });
});

describe("audit list query", () => {
  it("caps page size", () => {
    const parsed = auditListQuerySchema.safeParse({ page: 1, limit: 500 });
    expect(parsed.success).toBe(false);
  });

  it("accepts filters", () => {
    const parsed = auditListQuerySchema.parse({
      page: 2,
      limit: 25,
      category: "EMAIL",
      result: "success",
      q: "smtp",
    });
    expect(parsed.page).toBe(2);
    expect(parsed.category).toBe("EMAIL");
  });
});

describe("audit metadata redaction", () => {
  it("removes message bodies and credentials", () => {
    expect(
      sanitizeAuditMetadata({
        recipientCount: 2,
        bodyHtml: "<p>secret</p>",
        SPACEMAIL_PASSWORD: "x",
        smtpPass: "y",
      }),
    ).toEqual({ recipientCount: 2 });
  });
});
