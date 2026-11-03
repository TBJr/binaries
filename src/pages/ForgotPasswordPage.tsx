import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { PageMeta } from "@/components/layout/PageMeta";

export function ForgotPasswordPage() {
  return (
    <>
      <PageMeta
        title="Reset password | Binaries.nl"
        description="Reset your Binaries.nl account password."
        canonicalPath="/forgot-password/"
      />
      <ForgotPasswordForm />
    </>
  );
}
