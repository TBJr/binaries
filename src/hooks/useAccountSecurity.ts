import { useCallback, useEffect, useState } from "react";

export type AccountSecurityState = {
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  twoFactorEnforcementRequired: boolean;
  twoFactorEnforcementAfter: string | null;
  isSuperAdmin: boolean;
};

export function useAccountSecurity() {
  const [security, setSecurity] = useState<AccountSecurityState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const response = await fetch("/api/account/security", { credentials: "include" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Could not load security settings.");
      return;
    }
    setSecurity(payload.security ?? null);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/account/security", { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setError(typeof payload.error === "string" ? payload.error : "Could not load security settings.");
          setLoading(false);
          return;
        }
        setSecurity(payload.security ?? null);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load security settings.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { security, loading, error, setError, reload };
}
