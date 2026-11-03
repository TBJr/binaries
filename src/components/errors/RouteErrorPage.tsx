import { useState } from "react";
import { isRouteErrorResponse, Link, useNavigate, useRouteError } from "react-router-dom";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageMeta } from "@/components/layout/PageMeta";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { describeRouteFailure, isStaleAssetError } from "@/lib/route-error";
import { AccessDeniedPage } from "@/pages/AccessDeniedPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

function failureFromRouteError(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return describeRouteFailure({ status: error.status, statusText: error.statusText });
  }
  if (isStaleAssetError(error)) return describeRouteFailure(error);
  return describeRouteFailure(error);
}

function ErrorActions({
  reload,
  dashboard,
}: {
  reload: boolean;
  dashboard: boolean;
}) {
  const navigate = useNavigate();
  const [reloading, setReloading] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      {reload ? (
        <Button
          type="button"
          disabled={reloading}
          onClick={() => {
            setReloading(true);
            window.location.reload();
          }}
        >
          Reload application
        </Button>
      ) : (
        <Button type="button" onClick={() => window.location.reload()}>
          Try again
        </Button>
      )}
      {dashboard ? (
        <Button variant="outline" asChild>
          <Link to="/app/">Go to Dashboard</Link>
        </Button>
      ) : null}
      <Button variant="outline" type="button" onClick={() => navigate(-1)}>
        Go back
      </Button>
    </div>
  );
}

export function WorkspaceRouteError() {
  const failure = failureFromRouteError(useRouteError());
  if (failure.kind === "forbidden") {
    return (
      <DashboardLayout>
        <AccessDeniedPage />
      </DashboardLayout>
    );
  }
  if (failure.kind === "not_found") {
    return (
      <DashboardLayout>
        <NotFoundPage variant="app" />
      </DashboardLayout>
    );
  }
  return (
    <DashboardLayout>
      <AppPageContainer>
        <PageMeta title={`${failure.title} | Binaries.nl`} description={failure.description} canonicalPath="/app/" />
        <PageHeader title={failure.title} description={failure.description} />
        <ErrorActions reload={failure.reload} dashboard />
      </AppPageContainer>
    </DashboardLayout>
  );
}

export function StandaloneRouteError() {
  const failure = failureFromRouteError(useRouteError());
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <PageMeta title={`${failure.title} | Binaries.nl`} description={failure.description} canonicalPath="/" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{failure.title}</h1>
        <p className="text-sm text-muted-foreground">{failure.description}</p>
      </div>
      <ErrorActions reload={failure.reload} dashboard={false} />
    </main>
  );
}
