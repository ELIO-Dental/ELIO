"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Input, Label } from "@elio/ui";
import { AuthFormCard, AuthShell } from "@/components/auth-shell";

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();

  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  // Split by field — previously a single `error` string was always rendered under
  // the "New password" field, so a "Passwords do not match" error (really about the
  // Confirm field) or an invalid-link error (not about either field) both showed up
  // attached to the field the user typed correctly, with Confirm showing nothing.
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setConfirmError(null);
    setFormError(null);

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setConfirmError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, password }),
    });
    const data = await res.json().catch(() => ({ ok: false }));
    setLoading(false);

    if (!data.ok) {
      setFormError("This reset link is invalid or has expired. Please request a new one.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  return (
    <AuthShell headline="New password" description="Choose a strong password for your ELIO account.">
      <AuthFormCard title="Set a new password">
        {done ? (
          <p className="text-body leading-relaxed text-(--color-success)" data-testid="reset-password-success">
            Your password has been reset. Redirecting to sign in&hellip;
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5" data-testid="reset-password-form">
            {formError ? (
              <p className="text-body-sm text-(--color-danger)" data-testid="reset-password-form-error">
                {formError}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={passwordError ?? undefined}
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                error={confirmError ?? undefined}
                className="h-12"
              />
            </div>
            <Button type="submit" className="h-12 w-full" loading={loading} data-testid="reset-password-submit">
              Reset password
            </Button>
          </form>
        )}
      </AuthFormCard>
    </AuthShell>
  );
}
