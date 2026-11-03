import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Silent SPA page-view beacons for authenticated app routes.
 * Never surfaces success/failure in the UI (no toasts/alerts/notices).
 */
export function ActivityTracker() {
  const location = useLocation();
  const lastSentRef = useRef<string | null>(null);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    if (!path.startsWith("/app")) return;
    if (lastSentRef.current === path) return;
    lastSentRef.current = path;

    const title = typeof document !== "undefined" ? document.title : undefined;
    void fetch("/api/activity/page-view", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, title }),
    }).catch(() => undefined);
  }, [location.pathname, location.search]);

  return null;
}
