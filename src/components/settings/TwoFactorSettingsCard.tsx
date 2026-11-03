import { useState } from "react";

import { TotpEnrollmentSetup } from "@/components/settings/TotpEnrollmentSetup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AccountSecurityState } from "@/hooks/useAccountSecurity";
import { authClient } from "@/lib/auth-client";

type TwoFactorSettingsCardProps = {
  security: AccountSecurityState | null;
  onSecurityReload: () => Promise<void>;
  idPrefix?: string;
};

export function TwoFactorSettingsCard({
  security,
  onSecurityReload,
  idPrefix = "security",
}: TwoFactorSettingsCardProps) {
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const passwordId = `${idPrefix}-password`;

  async function startTotpEnrollment() {
    setError(null);
    setBusy(true);
    const enable = await authClient.twoFactor.enable({ password, method: "totp" });
    if (enable.error) {
      setBusy(false);
      setError(enable.error.message ?? "Could not start two-factor enrollment.");
      return;
    }

    const data = enable.data as
      | { method?: string; totpURI?: string; backupCodes?: string[] }
      | null
      | undefined;

    if (data?.backupCodes?.length) {
      setBackupCodes(data.backupCodes);
    }

    let uri = data?.totpURI ?? null;
    if (!uri) {
      const fetched = await authClient.twoFactor.getTotpUri({ password });
      if (fetched.error || !fetched.data?.totpURI) {
        setBusy(false);
        setError(fetched.error?.message ?? "Could not load authenticator setup.");
        return;
      }
      uri = fetched.data.totpURI;
    }

    setTotpUri(uri);
    setBusy(false);
  }

  async function confirmTotp() {
    setError(null);
    setBusy(true);
    const verified = await authClient.twoFactor.verifyTotp({ code: totpCode, trustDevice: false });
    setBusy(false);
    if (verified.error) {
      setError(verified.error.message ?? "Invalid code.");
      return;
    }
    setTotpUri(null);
    setTotpCode("");
    setPassword("");
    await authClient.getSession();
    await onSecurityReload();
  }

  async function disableTwoFactor() {
    setError(null);
    setBusy(true);
    const result = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Could not disable two-factor authentication.");
      return;
    }
    setPassword("");
    setBackupCodes([]);
    await authClient.getSession();
    await onSecurityReload();
  }

  async function regenerateBackupCodes() {
    setError(null);
    setBusy(true);
    const result = await authClient.twoFactor.generateBackupCodes({ password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Could not regenerate backup codes.");
      return;
    }
    setBackupCodes(result.data?.backupCodes ?? []);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>Use an authenticator app (Google Authenticator, 1Password, Bitwarden, etc.)</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Status</span>
          <Badge variant={security?.twoFactorEnabled ? "default" : "outline"}>
            {security?.twoFactorEnabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
        {security?.isSuperAdmin && !security.twoFactorEnabled && security.twoFactorEnforcementAfter ? (
          <p className="text-sm text-muted-foreground">
            Super-administrator accounts must enable 2FA by{" "}
            {new Date(security.twoFactorEnforcementAfter).toLocaleString()}.
          </p>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor={passwordId}>Confirm with password</Label>
          <Input
            id={passwordId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {!security?.twoFactorEnabled ? (
          <>
            <Button type="button" disabled={busy || !password} onClick={() => void startTotpEnrollment()}>
              Enable authenticator app
            </Button>
            {totpUri ? (
              <TotpEnrollmentSetup
                totpUri={totpUri}
                totpCode={totpCode}
                onTotpCodeChange={setTotpCode}
                onConfirm={() => void confirmTotp()}
                confirmDisabled={busy || totpCode.length < 6}
                confirmBusy={busy}
                idPrefix={idPrefix}
              />
            ) : null}
          </>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={busy || !password} onClick={() => void regenerateBackupCodes()}>
              Regenerate backup codes
            </Button>
            {!(security?.isSuperAdmin && security.twoFactorEnforcementRequired) ? (
              <Button type="button" variant="destructive" disabled={busy || !password} onClick={() => void disableTwoFactor()}>
                Disable 2FA
              </Button>
            ) : null}
          </>
        )}
        {backupCodes.length > 0 ? (
          <div className="rounded-md border bg-muted/40 p-3 text-xs">
            <p className="mb-2 font-medium">Store these backup codes securely. They will not be shown again.</p>
            <ul className="grid gap-1 font-mono">
              {backupCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
