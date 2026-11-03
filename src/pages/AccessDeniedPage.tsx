import { Link, useNavigate } from "react-router-dom";

import { PageMeta } from "@/components/layout/PageMeta";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";

export function AccessDeniedPage() {
  const navigate = useNavigate();
  return (
    <AppPageContainer>
      <PageMeta
        title="Access denied | Binaries.nl"
        description="You do not have permission to view this area."
        canonicalPath="/app/"
      />
      <PageHeader title="Access denied" description="You do not have permission to view this area." />
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/app/">Go to Dashboard</Link>
        </Button>
        <Button variant="outline" type="button" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    </AppPageContainer>
  );
}
