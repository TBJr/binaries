import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { PageMeta } from "@/components/layout/PageMeta";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  auditOutcomeLabel,
  auditOutcomeVariant,
  formatAuditAction,
} from "@/lib/audit-display";
import { AUDIT_CATEGORIES } from "@/lib/audit-taxonomy";

type AuditActor = { id: string; name: string; email: string } | null;

type AuditEvent = {
  id: string;
  action: string;
  eventType: string | null;
  category: string | null;
  result: string;
  description: string | null;
  actorUserId: string | null;
  actorType: string | null;
  actorEmail: string | null;
  targetUserId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor?: AuditActor;
  target?: AuditActor;
};

type Summary = {
  eventsLast24Hours: number;
  failedAuthenticationLast24Hours: number;
  administrativeChangesLast24Hours: number;
  securityEventsLast24Hours: number;
};

export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const filters = useMemo(
    () => ({
      q: searchParams.get("q") ?? "",
      category: searchParams.get("category") ?? "",
      result: searchParams.get("result") ?? "",
      action: searchParams.get("action") ?? "",
      page: Number(searchParams.get("page") ?? "1") || 1,
    }),
    [searchParams],
  );

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      if (!value.trim()) next.delete(key);
      else next.set(key, value.trim());
      if (key !== "page") next.set("page", "1");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("page", String(filters.page));
    params.set("limit", "25");
    if (filters.q) params.set("q", filters.q);
    if (filters.category) params.set("category", filters.category);
    if (filters.result) params.set("result", filters.result);
    if (filters.action) params.set("action", filters.action);

    Promise.all([
      fetch(`/api/admin/audit?${params.toString()}`, { credentials: "include" }),
      fetch("/api/admin/audit/summary", { credentials: "include" }),
    ])
      .then(async ([listRes, summaryRes]) => {
        const listBody = await listRes.json();
        const summaryBody = await summaryRes.json();
        if (!listRes.ok) {
          throw new Error(listBody.error ?? "Could not load the audit log.");
        }
        setEvents(listBody.events ?? []);
        setPagination(listBody.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 1 });
        if (summaryRes.ok) {
          setSummary(summaryBody);
        } else {
          setSummary(null);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load the audit log.");
      })
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  function actorLabel(event: AuditEvent) {
    if (event.actor?.name) return `${event.actor.name} (${event.actor.email})`;
    if (event.actorEmail) return event.actorEmail;
    if (event.actorType === "worker" || event.actorType === "system") return event.actorType;
    return event.actorUserId ?? "—";
  }

  return (
    <>
      <PageMeta
        title="Audit log | Binaries.nl"
        description="Security events and administrative activity."
        canonicalPath="/app/admin/audit/"
      />
      <AppPageContainer width="wide">
        <PageHeader
          title="Audit log"
          description="Review security events, administrative changes, and important activities across Binaries.nl."
          actions={
            <Button type="button" variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          }
        />

        {summary ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Events (24h)" value={String(summary.eventsLast24Hours)} hint="All recorded audit events" />
            <StatCard label="Failed sign-ins (24h)" value={String(summary.failedAuthenticationLast24Hours)} hint="Authentication failures" />
            <StatCard label="Admin changes (24h)" value={String(summary.administrativeChangesLast24Hours)} hint="Users and roles" />
            <StatCard label="Security (24h)" value={String(summary.securityEventsLast24Hours)} hint="Auth and security category" />
          </div>
        ) : loading ? (
          <Skeleton className="h-24 w-full" />
        ) : null}

        <Card>
          <CardContent className="space-y-4 py-5">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="audit-q">Search</Label>
                <Input
                  id="audit-q"
                  value={filters.q}
                  onChange={(e) => updateFilter("q", e.target.value)}
                  placeholder="Action or description"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="audit-category">Category</Label>
                <select
                  id="audit-category"
                  className="native-select"
                  value={filters.category}
                  onChange={(e) => updateFilter("category", e.target.value)}
                >
                  <option value="">All categories</option>
                  {AUDIT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="audit-result">Outcome</Label>
                <select
                  id="audit-result"
                  className="native-select"
                  value={filters.result}
                  onChange={(e) => updateFilter("result", e.target.value)}
                >
                  <option value="">All outcomes</option>
                  <option value="success">Success</option>
                  <option value="failure">Failed</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="audit-action">Action</Label>
                <Input
                  id="audit-action"
                  value={filters.action}
                  onChange={(e) => updateFilter("action", e.target.value)}
                  placeholder="Exact action key"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSearchParams({}, { replace: true })}
              >
                Reset filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>Outcome</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-muted-foreground">
                            No audit events match your filters.
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {events.map((event) => (
                        <TableRow
                          key={event.id}
                          className="cursor-pointer"
                          onClick={() => setSelected(event)}
                        >
                          <TableCell className="whitespace-nowrap">
                            {new Date(event.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="max-w-xs truncate" title={event.action}>
                            {formatAuditAction(event.action, event.description)}
                          </TableCell>
                          <TableCell>{event.category ?? event.eventType ?? "—"}</TableCell>
                          <TableCell className="max-w-[12rem] truncate" title={actorLabel(event)}>
                            {actorLabel(event)}
                          </TableCell>
                          <TableCell className="max-w-[10rem] truncate">
                            {event.resourceType ? `${event.resourceType}:${event.resourceId ?? "—"}` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={auditOutcomeVariant(event.result)}>
                              {auditOutcomeLabel(event.result)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="divide-y md:hidden">
                  {events.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left text-sm"
                        onClick={() => setSelected(event)}
                      >
                        <p className="font-medium">{formatAuditAction(event.action, event.description)}</p>
                        <p className="text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} events
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => updateFilter("page", String(pagination.page - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => updateFilter("page", String(pagination.page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </AppPageContainer>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{formatAuditAction(selected.action, selected.description)}</SheetTitle>
                <SheetDescription>{selected.id}</SheetDescription>
              </SheetHeader>
              <dl className="mt-6 space-y-3 text-sm">
                <div><dt className="text-muted-foreground">Timestamp</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd></div>
                <div><dt className="text-muted-foreground">Category</dt><dd>{selected.category ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Outcome</dt><dd>{auditOutcomeLabel(selected.result)}</dd></div>
                <div><dt className="text-muted-foreground">Actor</dt><dd>{actorLabel(selected)}</dd></div>
                <div><dt className="text-muted-foreground">Resource</dt><dd>{selected.resourceType ? `${selected.resourceType} / ${selected.resourceId ?? "—"}` : "—"}</dd></div>
                {selected.requestId ? <div><dt className="text-muted-foreground">Request ID</dt><dd className="break-all">{selected.requestId}</dd></div> : null}
                {selected.ipAddress ? <div><dt className="text-muted-foreground">IP address</dt><dd>{selected.ipAddress}</dd></div> : null}
                {(() => {
                  const client = selected.metadata?.client;
                  if (!client || typeof client !== "object" || Array.isArray(client)) return null;
                  const c = client as Record<string, unknown>;
                  const browser = [c.browser, c.browserVersion].filter(Boolean).join(" ");
                  const os = [c.os, c.osVersion].filter(Boolean).join(" ");
                  const device = typeof c.deviceType === "string" ? c.deviceType : null;
                  if (!browser && !os && !device) return null;
                  return (
                    <>
                      {browser ? <div><dt className="text-muted-foreground">Browser</dt><dd>{browser}</dd></div> : null}
                      {os ? <div><dt className="text-muted-foreground">Operating system</dt><dd>{os}</dd></div> : null}
                      {device ? <div><dt className="text-muted-foreground">Device</dt><dd>{device}</dd></div> : null}
                    </>
                  );
                })()}
                {typeof selected.metadata?.locale === "string" ? (
                  <div><dt className="text-muted-foreground">Language</dt><dd>{selected.metadata.locale}</dd></div>
                ) : null}
                {typeof selected.metadata?.country === "string" ? (
                  <div><dt className="text-muted-foreground">Country</dt><dd>{selected.metadata.country}</dd></div>
                ) : null}
                {selected.userAgent ? <div><dt className="text-muted-foreground">User agent</dt><dd className="break-all text-xs">{selected.userAgent}</dd></div> : null}
                <div>
                  <dt className="text-muted-foreground">Metadata</dt>
                  <dd className="mt-1 rounded-md border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap break-all">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </dd>
                </div>
              </dl>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
