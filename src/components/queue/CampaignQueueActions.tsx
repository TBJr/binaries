import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Campaign } from "@/lib/campaigns-api";
import {
  enqueueCampaignSimulation,
  pauseCampaignQueue,
  QueueApiError,
  resumeCampaignQueue,
} from "@/lib/queue-api";

type CampaignQueueActionsProps = {
  campaign: Campaign;
  queueEnabled: boolean;
  simulationOnly?: boolean;
  onUpdated?: () => void;
};

export function CampaignQueueActions({
  campaign,
  queueEnabled,
  simulationOnly = true,
  onUpdated,
}: CampaignQueueActionsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onUpdated?.();
    } catch (err) {
      setError(err instanceof QueueApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const canActivate = ["ready", "scheduled"].includes(campaign.status);
  const canPause = ["queued", "processing", "sending"].includes(campaign.status);
  const canResume = campaign.status === "paused";

  const enqueue = async () => {
    if (!simulationOnly) {
      const confirmed = window.confirm(
        "This will send real emails to every eligible recipient through the configured mail provider. Continue?",
      );
      if (!confirmed) return;
    }
    await enqueueCampaignSimulation(campaign.id);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {simulationOnly
          ? "Simulation only — no SMTP or outbound email delivery occurs."
          : "Live delivery — workers will send real messages via the configured mail provider. Daily volume is capped by QUEUE_DAILY_SEND_CAP."}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {canActivate && (
          <Button size="sm" disabled={busy || !queueEnabled} onClick={() => run(enqueue)}>
            {simulationOnly ? "Activate simulation queue" : "Start campaign delivery"}
          </Button>
        )}
        {canPause && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => pauseCampaignQueue(campaign.id))}>
            {simulationOnly ? "Pause simulation" : "Pause delivery"}
          </Button>
        )}
        {canResume && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => resumeCampaignQueue(campaign.id))}>
            {simulationOnly ? "Resume simulation" : "Resume delivery"}
          </Button>
        )}
      </div>
      {!queueEnabled && (
        <p className="text-xs text-muted-foreground">
          Queue is disabled on the server (QUEUE_ENABLED=false or Redis unavailable).
        </p>
      )}
    </div>
  );
}
