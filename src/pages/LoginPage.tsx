import { LoginForm } from "@/components/auth/LoginForm";
import { PageMeta } from "@/components/layout/PageMeta";

export function LoginPage() {
  return (
    <>
      <PageMeta
        title="Sign in | Binaries.nl"
        description="Sign in to the Binaries.nl workspace."
        canonicalPath="/login/"
      />
      <LoginForm />
    </>
  );
}
