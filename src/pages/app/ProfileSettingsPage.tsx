import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { PageMeta } from "@/components/layout/PageMeta";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { SettingsSectionNav } from "@/components/settings/SettingsSectionNav";
import { TwoFactorSettingsCard } from "@/components/settings/TwoFactorSettingsCard";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccountSecurity } from "@/hooks/useAccountSecurity";
import { authClient } from "@/lib/auth-client";

type Profile = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
};

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ProfileSettingsPage() {
  const { data: session } = authClient.useSession();
  const sessionUser = session?.user as
    | { id: string; name: string; email: string; emailVerified?: boolean; image?: string | null }
    | undefined;
  const { security, error: securityError, reload: reloadSecurity } = useAccountSecurity();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/profile", { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setError(typeof payload.error === "string" ? payload.error : "Could not load profile.");
          setLoading(false);
          return;
        }
        const next = payload.profile as Profile;
        setProfile(next);
        setName(next.name);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load profile.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (profile || !sessionUser) return;
    setName(sessionUser.name);
  }, [profile, sessionUser]);

  const display = profile ?? (sessionUser
    ? {
        id: sessionUser.id,
        name: sessionUser.name,
        email: sessionUser.email,
        emailVerified: Boolean(sessionUser.emailVerified),
        image: sessionUser.image ?? null,
      }
    : null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a display name.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Could not update profile.");
        return;
      }
      const next = payload.profile as Profile;
      setProfile(next);
      setName(next.name);
      setMessage("Profile updated.");
      await authClient.getSession();
    } catch {
      setError("Could not update profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageMeta
        title="Profile | Binaries.nl"
        description="Update your display name and account security."
        canonicalPath="/app/settings/profile/"
      />
      <AppPageContainer>
        <PageHeader title="Profile" description="Your account details for Binaries.nl." />
        <SettingsSectionNav />
        {error || securityError ? (
          <p className="text-sm text-destructive" role="alert">{error ?? securityError}</p>
        ) : null}
        {message ? <p className="text-sm" role="status">{message}</p> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Update how your name appears in the workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading && !display ? (
                <p className="text-sm text-muted-foreground">Loading profile…</p>
              ) : display ? (
                <form className="grid gap-4" onSubmit={(event) => void save(event)}>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 rounded-lg">
                      {display.image ? <AvatarImage src={display.image} alt={display.name} /> : null}
                      <AvatarFallback className="rounded-lg">{initialsFor(display.name || name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 text-sm text-muted-foreground">
                      Avatar is display-only for now.
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="profile-name">Display name</Label>
                    <Input
                      id="profile-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoComplete="name"
                      required
                      maxLength={120}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input id="profile-email" value={display.email} readOnly disabled />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Verification</span>
                      <Badge variant={display.emailVerified ? "default" : "outline"}>
                        {display.emailVerified ? "Verified" : "Unverified"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Email changes require a verification flow and are not changed here.
                    </p>
                  </div>
                  <Button type="submit" disabled={saving || !name.trim()}>
                    {saving ? "Saving…" : "Save profile"}
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">Could not load profile.</p>
              )}
            </CardContent>
          </Card>

          {security?.mustChangePassword ? (
            <Card>
              <CardHeader>
                <CardTitle>Change password</CardTitle>
                <CardDescription>Your account requires a new password before you continue.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="button" variant="outline" asChild>
                  <Link to="/app/change-password/">Change password</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ChangePasswordForm
              onSuccess={() => {
                void authClient.getSession();
                void reloadSecurity();
              }}
            />
          )}

          <TwoFactorSettingsCard
            security={security}
            onSecurityReload={reloadSecurity}
            idPrefix="profile"
          />
        </div>
      </AppPageContainer>
    </>
  );
}
