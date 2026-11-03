import { z } from "zod";

import { SYSTEM_ROLE_KEYS } from "../auth/permissions.js";

const demoUserSchema = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),
  name: z.string().trim().min(1).max(80),
  role: z.enum(SYSTEM_ROLE_KEYS),
});

export const demoUserSeedSchema = z
  .object({
    users: z.array(demoUserSchema).min(1).max(100),
  })
  .superRefine(({ users }, context) => {
    const emails = new Set<string>();
    for (const [index, account] of users.entries()) {
      if (emails.has(account.email)) {
        context.addIssue({
          code: "custom",
          path: ["users", index, "email"],
          message: "Duplicate email address.",
        });
      }
      emails.add(account.email);
    }
  });

export type DemoUserSeed = z.infer<typeof demoUserSeedSchema>;
