export const ACCOUNT_SECURITY_UPDATED_EVENT = "account-security-updated";

export function notifyAccountSecurityUpdated() {
  window.dispatchEvent(new Event(ACCOUNT_SECURITY_UPDATED_EVENT));
}
