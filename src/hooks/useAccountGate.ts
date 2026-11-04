import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { ACCOUNT_SECURITY_UPDATED_EVENT } from "@/lib/account-security-events";

export type AccountGate = {
  loading: boolean;
  mustChangePassword: boolean;
  twoFactorEnforcementRequired: boolean;
};

type RemoteGate = {
  mustChangePassword: boolean;
  twoFactorEnforcementRequired: boolean;
};

export function useAccountGate(): AccountGate {
  const { data: session, isPending } = authClient.useSession();
  const [remote, setRemote] = useState<RemoteGate | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const userId = session?.user?.id;

  useEffect(() => {
    function refreshAccountGate() {
      setRemote(null);
      setRefreshKey((current) => current + 1);
    }

    window.addEventListener(ACCOUNT_SECURITY_UPDATED_EVENT, refreshAccountGate);
    return () => window.removeEventListener(ACCOUNT_SECURITY_UPDATED_EVENT, refreshAccountGate);
  }, []);

  useEffect(() => {
    if (isPending || !userId) {
      return;
    }
    let cancelled = false;
    fetch("/api/me", { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setRemote({ mustChangePassword: false, twoFactorEnforcementRequired: false });
          return;
        }
        setRemote({
          mustChangePassword: Boolean(payload.user?.mustChangePassword),
          twoFactorEnforcementRequired: Boolean(payload.user?.twoFactorEnforcementRequired),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setRemote({ mustChangePassword: false, twoFactorEnforcementRequired: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, userId, refreshKey]);

  if (isPending) {
    return { loading: true, mustChangePassword: false, twoFactorEnforcementRequired: false };
  }
  if (!session?.user) {
    return { loading: false, mustChangePassword: false, twoFactorEnforcementRequired: false };
  }
  if (!remote) {
    return { loading: true, mustChangePassword: false, twoFactorEnforcementRequired: false };
  }
  return { loading: false, ...remote };
}
