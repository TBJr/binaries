import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { PageMeta } from "@/components/layout/PageMeta";

export function ResetPasswordPage() {
  return (
    <>
      <PageMeta
        title="Choose new password | Binaries.nl"
        description="Set a new password for your Binaries.nl account."
        canonicalPath="/reset-password/"
      />
      <ResetPasswordForm />
    </>
  );
}
