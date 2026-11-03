import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

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
  const userId = session?.user?.id;

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
  }, [isPending, userId]);

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
