import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageMeta } from "@/components/layout/PageMeta";
import { authClient } from "@/lib/auth-client";
import { mapAuthErrorMessage } from "@/lib/auth-validation";

function safeRedirectPath(value: string | null) {
  if (!value) return "/app/";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    return "/app/";
  }
  return "/app/";
}

export function LoginTwoFactorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const redirectTo = safeRedirectPath(searchParams.get("redirect"));
    const result = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice: false })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
    setSubmitting(false);
    if (result.error) {
      setError(mapAuthErrorMessage(result.error.message ?? "Verification failed."));
      return;
    }
    navigate(redirectTo, { replace: true });
  }

  return (
    <>
      <PageMeta
        title="Two-factor verification | Binaries.nl"
        description="Complete two-factor authentication to sign in."
        canonicalPath="/login/two-factor/"
      />
      <AuthCardShell>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <h1 className="text-center text-2xl font-bold">Two-factor verification</h1>
            <p className="text-center text-sm text-muted-foreground">
              Enter the code from your authenticator app{useBackup ? " or a backup code" : ""}.
            </p>
            <Field>
              <FieldLabel htmlFor="two-factor-code">{useBackup ? "Backup code" : "Authenticator code"}</FieldLabel>
              <Input
                id="two-factor-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Verifying…" : "Continue"}
            </Button>
            <Button type="button" variant="link" className="w-full" onClick={() => setUseBackup((current) => !current)}>
              {useBackup ? "Use authenticator code instead" : "Use a backup code instead"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login/">Back to sign in</Link>
            </p>
          </FieldGroup>
        </form>
      </AuthCardShell>
    </>
  );
}
