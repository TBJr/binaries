import { z } from "zod";

export const updateAccountProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export function selfProfileAuditMetadata(fields: string[]) {
  return {
    method: "self_profile" as const,
    fields,
  };
}
