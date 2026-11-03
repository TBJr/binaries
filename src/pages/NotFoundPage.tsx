import { Link, useNavigate } from "react-router-dom";

import { Atmosphere } from "@/components/layout/Atmosphere";
import { PageMeta } from "@/components/layout/PageMeta";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { appPageTitle } from "@/lib/brand";

export function NotFoundPage({ variant = "public" }: { variant?: "public" | "app" }) {
  const navigate = useNavigate();
  const actions = (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button asChild>
        <Link to={variant === "app" ? "/app/" : "/"}>
          {variant === "app" ? "Go to Dashboard" : "Back to home"}
        </Link>
      </Button>
      <Button variant="outline" type="button" onClick={() => navigate(-1)}>
        Go back
      </Button>
    </div>
  );

  if (variant === "app") {
    return (
      <AppPageContainer>
        <PageMeta
          title={appPageTitle("Page not found")}
          description="The page you're looking for does not exist or may have moved."
          canonicalPath="/app/"
        />
        <PageHeader
          title="Page not found"
          description="The page you're looking for does not exist or may have moved."
        />
        {actions}
      </AppPageContainer>
    );
  }

  return (
    <div className="page legal-page">
      <PageMeta
        title={appPageTitle("Page not found")}
        description="The page you're looking for does not exist or may have moved."
        canonicalPath="/404/"
      />
      <Atmosphere />
      <main>
        <div className="shell">
          <h1>Page not found</h1>
          <p className="lead">The page you're looking for does not exist or may have moved.</p>
          {actions}
        </div>
      </main>
    </div>
  );
}
