"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Badge } from "@elio/ui";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 10) {
      setError("New password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/profile/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.error?.code === "WRONG_PASSWORD") {
        setError("Your current password is incorrect.");
        return;
      }
      setError("Could not update password. Please try again.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess(true);
  }

  return (
    <Card className="border-(--color-border-subtle) shadow-(--shadow-sm)">
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        {success && (
          <p className="mb-4 text-body-sm text-(--color-success)" data-testid="password-change-success">
            Your password has been updated.
          </p>
        )}
        <form onSubmit={onSubmit} className="space-y-4" data-testid="change-password-form">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={10}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={10}
            />
          </div>
          {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}
          <Button type="submit" loading={loading} data-testid="change-password-submit">
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function MfaEnrollmentCard({ mfaEnabled, email }: { mfaEnabled: boolean; email: string }) {
  const router = useRouter();
  const [secret, setSecret] = React.useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function beginSetup() {
    setError(null);
    setSuccess(false);
    setLoading(true);
    const res = await fetch("/api/settings/mfa/begin", { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      setError("Could not start authenticator setup. Try again.");
      return;
    }
    const data = await res.json();
    setSecret(data.secret);
    setOtpauthUrl(data.otpauthUrl);
    setCode("");
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setError(null);
    setLoading(true);
    const res = await fetch("/api/settings/mfa/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, code }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Invalid code — check your authenticator app and try again.");
      return;
    }
    setSuccess(true);
    setSecret(null);
    setOtpauthUrl(null);
    setCode("");
    router.refresh();
  }

  return (
    <Card className="border-(--color-border-subtle) shadow-(--shadow-sm)">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Authenticator app (MFA)</CardTitle>
          <Badge variant={mfaEnabled ? "success" : "warning"}>{mfaEnabled ? "Enabled" : "Required"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!mfaEnabled && (
          <p className="text-body-sm leading-relaxed text-(--color-text-secondary)">
            Before using the tenant console, add ELIO Super Admin to Google Authenticator (or any TOTP app). You will
            need a 6-digit code every time you sign in.
          </p>
        )}
        {mfaEnabled && !secret && (
          <p className="text-body-sm text-(--color-text-secondary)">
            MFA is active for <span className="font-medium text-(--color-text-primary)">{email}</span>. Generate a new
            setup key only if you are replacing your authenticator device.
          </p>
        )}
        {success && (
          <p className="text-body-sm text-(--color-success)" data-testid="mfa-enroll-success">
            Authenticator enrolled. You can now open the tenant console.
          </p>
        )}
        {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}

        {!secret ? (
          <Button type="button" variant={mfaEnabled ? "secondary" : "primary"} loading={loading} onClick={beginSetup} data-testid="mfa-begin">
            {mfaEnabled ? "Replace authenticator" : "Set up authenticator"}
          </Button>
        ) : (
          <form onSubmit={confirmSetup} className="space-y-4" data-testid="mfa-enroll-form">
            <div className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-bg-subtle) p-4">
              <p className="text-caption font-semibold uppercase tracking-wide text-(--color-text-tertiary)">Setup key</p>
              <p className="mt-2 break-all font-mono text-body-sm text-(--color-text-primary)" data-testid="mfa-secret">
                {secret}
              </p>
              <p className="mt-3 text-caption text-(--color-text-secondary)">
                In your authenticator app, choose <strong>Enter a setup key</strong> and paste this string for account{" "}
                <strong>{email}</strong>.
              </p>
              {otpauthUrl && (
                <p className="mt-2 break-all text-caption text-(--color-text-tertiary)">
                  Or open this URL on your phone if your app supports it: {otpauthUrl}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mfa-code">6-digit code from your app</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-12 text-center text-h3 tracking-[0.35em]"
                required
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={loading} data-testid="mfa-confirm">
                Confirm authenticator
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setSecret(null); setOtpauthUrl(null); }}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
