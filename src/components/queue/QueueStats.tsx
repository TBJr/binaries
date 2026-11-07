import { StatCard } from "@/components/shared/StatCard";

type QueueStatsProps = {
  stats: Record<string, number>;
  simulationOnly?: boolean;
};

export function QueueStats({ stats, simulationOnly = true }: QueueStatsProps) {
  const completed = simulationOnly
    ? (stats.simulation_completed ?? 0)
    : (stats.delivered ?? 0) + (stats.simulation_completed ?? 0);
  const failed = simulationOnly
    ? (stats.simulation_failed ?? 0)
    : (stats.send_failed ?? 0) + (stats.simulation_failed ?? 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Pending / queued"
        value={((stats.pending ?? 0) + (stats.queued ?? 0)).toLocaleString()}
        hint={simulationOnly ? "Waiting for simulation workers" : "Waiting for delivery workers"}
      />
      <StatCard
        label="Processing"
        value={(stats.processing ?? 0).toLocaleString()}
        hint={simulationOnly ? "Currently simulating" : "Currently sending"}
      />
      <StatCard
        label={simulationOnly ? "Simulation completed" : "Delivered"}
        value={completed.toLocaleString()}
        hint={simulationOnly ? "Not actual email delivery" : "Provider accepted the message"}
      />
      <StatCard
        label="Failed"
        value={failed.toLocaleString()}
        hint={simulationOnly ? "Terminal simulation errors" : "Terminal send failures"}
      />
      <StatCard label="Skipped" value={(stats.skipped ?? 0).toLocaleString()} hint="Ineligible at processing time" />
      <StatCard
        label="Cancelled"
        value={(stats.cancelled ?? 0).toLocaleString()}
        hint={simulationOnly ? "Stopped before simulation" : "Stopped before delivery"}
      />
    </div>
  );
}
