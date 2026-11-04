import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  validateConfirmPassword,
  validateEmail,
  validateName,
  validatePassword,
} from "@/lib/auth-validation";

const SIGNUP_ROLES = [
  { key: "user", label: "User" },
  { key: "viewer", label: "Viewer" },
  { key: "editor", label: "Editor" },
  { key: "campaign-manager", label: "Campaign manager" },
  { key: "admin", label: "Admin" },
] as const;

export function RegisterForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialRole = searchParams.get("role");
  const codeFromLink =
    searchParams.get("code") ??
    new URLSearchParams(location.hash.replace(/^#/, "")).get("code");
  const [roleKey, setRoleKey] = useState(
    SIGNUP_ROLES.some((role) => role.key === initialRole) ? initialRole! : "user",
  );
  const [code, setCode] = useState(codeFromLink ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors = {
      name: validateName(name),
      email: validateEmail(email),
      password: validatePassword(password),
      confirmPassword: validateConfirmPassword(password, confirmPassword),
      code: code.trim() ? null : "Signup code is required.",
    };
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setIsSubmitting(true);
    let response: Response;
    try {
      response = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          confirmPassword,
          roleKey,
          code: code.trim(),
        }),
      });
    } catch {
      setFormError("Unable to reach the signup service. Try again shortly.");
      setIsSubmitting(false);
      return;
    }
    const payload = await response.json().catch(() => ({}));
    setIsSubmitting(false);
    if (!response.ok) {
      setFormError(payload.error ?? payload.message ?? "The account could not be created.");
      return;
    }

    navigate("/verify-email/", {
      replace: true,
      state: { email: email.trim(), fromRegistration: true },
    });
  }

  return (
    <AuthCardShell>
      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">
              Binaries.nl · Email, Organized.
            </p>
            <h1 className="text-2xl font-bold">Create your account</h1>
          </div>
          <Field>
            <FieldLabel htmlFor="signup-role">Account type</FieldLabel>
            <select
              id="signup-role"
              name="role"
              className="native-select"
              value={roleKey}
              onChange={(event) => setRoleKey(event.target.value)}
              disabled={isSubmitting}
            >
              {SIGNUP_ROLES.map((role) => (
                <option key={role.key} value={role.key}>{role.label}</option>
              ))}
            </select>
            <FieldDescription>Super admin accounts can only be created by an existing super admin.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="signup-code">Authorization code</FieldLabel>
            <Input
              id="signup-code"
              name="code"
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.code ? true : undefined}
            />
            {fieldErrors.code ? (
              <FieldDescription className="text-destructive">{fieldErrors.code}</FieldDescription>
            ) : (
              <FieldDescription>Use the role-specific code provided by a super admin.</FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.name ? true : undefined}
            />
            {fieldErrors.name ? (
              <FieldDescription className="text-destructive">{fieldErrors.name}</FieldDescription>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.email ? true : undefined}
            />
            {fieldErrors.email ? (
              <FieldDescription className="text-destructive">{fieldErrors.email}</FieldDescription>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.password ? true : undefined}
            />
            {fieldErrors.password ? (
              <FieldDescription className="text-destructive">{fieldErrors.password}</FieldDescription>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
            <Input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={isSubmitting}
              aria-invalid={fieldErrors.confirmPassword ? true : undefined}
            />
            {fieldErrors.confirmPassword ? (
              <FieldDescription className="text-destructive">
                {fieldErrors.confirmPassword}
              </FieldDescription>
            ) : null}
          </Field>
          {formError ? (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          ) : null}
          <Field>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
          </Field>
          <FieldDescription className="text-center text-sm">
            Already have an account?{" "}
            <Link to="/login/" className="underline-offset-2 hover:underline">Sign in</Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </AuthCardShell>
  );
}
