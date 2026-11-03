import { z } from "zod";

import { validatePassword } from "../lib/password-policy.js";

export const manualEmailVerificationSchema = z.object({
  confirmed: z.literal(true, { error: "Confirm that you have verified this user's email address." }),
  expectedEmail: z.email(),
});

const passwordFieldsSchema = z.object({
  password: z.string().min(1).max(128),
  confirmPassword: z.string().min(1).max(128),
});

function refinePasswordWithConfirmation(
  value: { password: string; confirmPassword: string },
  context: z.RefinementCtx,
) {
  const passwordError = validatePassword(value.password);
  if (passwordError) {
    context.addIssue({ code: "custom", message: passwordError, path: ["password"] });
  }
  if (value.password !== value.confirmPassword) {
    context.addIssue({ code: "custom", message: "Passwords do not match.", path: ["confirmPassword"] });
  }
}

export const passwordWithConfirmationSchema = passwordFieldsSchema.superRefine(refinePasswordWithConfirmation);

export const adminSetPasswordSchema = passwordFieldsSchema
  .extend({
    requirePasswordChange: z.boolean().optional(),
  })
  .superRefine(refinePasswordWithConfirmation);

export const createUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email(),
    password: z.string().min(1).max(128),
    confirmPassword: z.string().min(1).max(128),
    roleIds: z.array(z.string().min(1)).min(1).max(5),
    status: z.enum(["active", "suspended"]),
  })
  .superRefine(refinePasswordWithConfirmation);
