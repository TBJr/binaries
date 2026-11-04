import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SIGNUP_ROLES = [
  { key: "user", label: "User" },
  { key: "viewer", label: "Viewer" },
  { key: "editor", label: "Editor" },
  { key: "campaign-manager", label: "Campaign manager" },
  { key: "admin", label: "Admin" },
] as const;

type SignupCode = {
  id: string;
  roleKey: string;
  status: "active" | "used" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string;
};

type GeneratedSignupCode = {
  roleKey: string;
  code: string;
  signupUrl: string;
  expiresAt: string;
};

export function SignupCodesPanel() {
  const [signupCodes, setSignupCodes] = useState<SignupCode[]>([]);
  const [roleKey, setRoleKey] = useState<(typeof SIGNUP_ROLES)[number]["key"]>("user");
  const [generated, setGenerated] = useState<GeneratedSignupCode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadSignupCodes() {
    const response = await fetch("/api/admin/signup-codes", { credentials: "include" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Could not load signup codes.");
    setSignupCodes(payload.signupCodes ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/signup-codes", { credentials: "include" })
      .then(async (response) => {
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(payload.error ?? "Could not load signup codes.");
          return;
        }
        setSignupCodes(payload.signupCodes ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load signup codes.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setGenerated(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/signup-codes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleKey }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Could not generate signup code.");
        return;
      }
      setGenerated(payload.signupCode);
      setMessage("Code created. It can be used once and expires in 7 days.");
      await loadSignupCodes();
    } catch {
      setError("Could not generate signup code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/signup-codes/${id}/revoke`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? "Could not revoke signup code.");
        return;
      }
      setMessage("Signup code revoked.");
      await loadSignupCodes();
    } catch {
      setError("Could not revoke signup code.");
    }
  }

  async function copySignupLink() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.signupUrl);
      setMessage("Signup link copied.");
    } catch {
      setError("Could not copy the signup link. Select and copy the link manually.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role signup codes</CardTitle>
        <p className="text-sm text-muted-foreground">
          Generate one-time, role-specific signup links. Codes expire after 7 days.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void generate(event)}>
          <div className="min-w-52 space-y-2">
            <Label htmlFor="signup-code-role">Role to authorize</Label>
            <select
              id="signup-code-role"
              className="native-select"
              value={roleKey}
              onChange={(event) => setRoleKey(event.target.value as typeof roleKey)}
              disabled={submitting}
            >
              {SIGNUP_ROLES.map((role) => (
                <option key={role.key} value={role.key}>{role.label}</option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Generating…" : "Generate signup link"}
          </Button>
        </form>

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        {message ? <p className="text-sm" role="status">{message}</p> : null}
        {generated ? (
          <div className="space-y-2 rounded-lg border p-3">
            <Label htmlFor="generated-signup-link">
              {generated.roleKey} signup link · expires {new Date(generated.expiresAt).toLocaleString()}
            </Label>
            <div className="flex flex-wrap gap-2">
              <Input id="generated-signup-link" readOnly value={generated.signupUrl} />
              <Button type="button" variant="outline" onClick={() => void copySignupLink()}>
                Copy link
              </Button>
            </div>
          </div>
        ) : null}

        <ul className="divide-y">
          {signupCodes.map((code) => (
            <li key={code.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                {code.roleKey} · {code.status} · expires {new Date(code.expiresAt).toLocaleString()}
              </span>
              {code.status === "active" ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void revoke(code.id)}>
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
