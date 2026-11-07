import { ListOrdered } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchQueueOverview } from "@/lib/queue-api";

export function QueueActivity() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [simulationOnly, setSimulationOnly] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchQueueOverview()
        .then((res) => {
          if (!cancelled) {
            setStats(res.stats);
            setEnabled(res.queueEnabled);
            setSimulationOnly(res.simulationOnly);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });

    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const completed = simulationOnly
    ? (stats?.simulation_completed ?? 0)
    : (stats?.delivered ?? 0);
  const failed = simulationOnly
    ? (stats?.simulation_failed ?? 0) + (stats?.skipped ?? 0)
    : (stats?.send_failed ?? 0) + (stats?.skipped ?? 0);

  return (
    <Card className="flex flex-1 flex-col">
      <CardHeader>
        <CardTitle>Queue activity</CardTitle>
        <CardDescription>
          {simulationOnly
            ? "Simulation processing only — not emails sent."
            : "Live campaign delivery through BullMQ workers."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : !enabled || !stats || stats.total === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title={simulationOnly ? "No simulation jobs" : "No delivery jobs"}
            description={
              enabled
                ? simulationOnly
                  ? "Queue a ready campaign to start background simulation."
                  : "Queue a ready campaign to start background delivery."
                : "Enable QUEUE_ENABLED and Redis on the API server to use the queue."
            }
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/app/queue/">Open queue</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2 text-sm">
            <li>Processing: {stats.processing ?? 0}</li>
            <li>
              {simulationOnly ? "Simulation completed" : "Delivered"}: {completed}
            </li>
            <li>Failed / skipped: {failed}</li>
            <li className="pt-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/app/queue/">View queue</Link>
              </Button>
            </li>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
