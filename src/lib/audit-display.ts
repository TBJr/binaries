export function auditOutcomeLabel(result: string) {
  if (result === "success") return "Success";
  if (result === "failure") return "Failed";
  return result;
}

export function auditOutcomeVariant(result: string): "default" | "destructive" | "outline" {
  if (result === "success") return "default";
  if (result === "failure") return "destructive";
  return "outline";
}

export function formatAuditAction(action: string, description?: string | null) {
  return description?.trim() || action.replaceAll("_", " ");
}
