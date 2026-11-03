import { Link } from "react-router-dom";

import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageMeta } from "@/components/layout/PageMeta";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { SettingsSectionNav } from "@/components/settings/SettingsSectionNav";
import { TwoFactorSettingsCard } from "@/components/settings/TwoFactorSettingsCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccountSecurity } from "@/hooks/useAccountSecurity";
import { authClient } from "@/lib/auth-client";

export function SecuritySettingsPage() {
  const { security, error, reload } = useAccountSecurity();

  return (
    <>
      <PageMeta title="Security | Binaries.nl" description="Password and two-factor settings." canonicalPath="/app/settings/security/" />
      <AppPageContainer>
        <PageHeader title="Security" description="Protect your Binaries.nl account." />
        <SettingsSectionNav />
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account security</CardTitle>
              <CardDescription>Password and enforcement status</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span>Password change required</span>
                <Badge variant={security?.mustChangePassword ? "destructive" : "outline"}>
                  {security?.mustChangePassword ? "Yes" : "No"}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span>Two-factor authentication</span>
                <Badge variant={security?.twoFactorEnabled ? "default" : "outline"}>
                  {security?.twoFactorEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              {security?.isSuperAdmin && !security.twoFactorEnabled && security.twoFactorEnforcementAfter ? (
                <p className="text-muted-foreground">
                  Super-administrator accounts must enable 2FA by{" "}
                  {new Date(security.twoFactorEnforcementAfter).toLocaleString()}.
                </p>
              ) : null}
              {security?.mustChangePassword ? (
                <Button type="button" variant="outline" asChild>
                  <Link to="/app/change-password/">Change password</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {security?.mustChangePassword ? null : (
            <ChangePasswordForm
              onSuccess={() => {
                void authClient.getSession();
                void reload();
              }}
            />
          )}

          <TwoFactorSettingsCard security={security} onSecurityReload={reload} idPrefix="security" />
        </div>
      </AppPageContainer>
    </>
  );
}
