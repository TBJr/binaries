import { useNavigate } from "react-router-dom";

import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageMeta } from "@/components/layout/PageMeta";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";

export function ChangePasswordPage() {
  const navigate = useNavigate();

  return (
    <>
      <PageMeta
        title="Change password | Binaries.nl"
        description="Set a new password before using the workspace."
        canonicalPath="/app/change-password/"
      />
      <AppPageContainer>
        <PageHeader
          title="Change your password"
          description="Your account requires a new password before you can access Binaries.nl."
        />
        <div className="max-w-lg">
          <ChangePasswordForm
            title="Required password update"
            description="Choose a strong password you have not used here before. Other sessions will be signed out."
            onSuccess={() => navigate("/app/", { replace: true })}
          />
        </div>
      </AppPageContainer>
    </>
  );
}
