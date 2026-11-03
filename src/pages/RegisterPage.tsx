import { RegisterForm } from "@/components/auth/RegisterForm";
import { PageMeta } from "@/components/layout/PageMeta";

export function RegisterPage() {
  return (
    <>
      <PageMeta
        title="Create account | Binaries.nl"
        description="Create a Binaries.nl account."
        canonicalPath="/register/"
      />
      <RegisterForm />
    </>
  );
}
