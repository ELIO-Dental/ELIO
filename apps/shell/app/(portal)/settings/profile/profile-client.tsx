"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, toast } from "@elio/ui";

export function ProfileDetailsForm({
  initialDisplayName,
  initialEmail,
}: {
  initialDisplayName: string;
  initialEmail: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = React.useState(initialDisplayName);
  const [email, setEmail] = React.useState(initialEmail);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDisplayName(initialDisplayName);
    setEmail(initialEmail);
  }, [initialDisplayName, initialEmail]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const code = data?.error?.code as string | undefined;
      const msg =
        code === "EMAIL_TAKEN"
          ? "That email is already in use."
          : code === "INVALID_EMAIL"
            ? "Enter a valid email address."
            : "Could not update profile. Please try again.";
      setError(msg);
      toast.error(msg);
      return;
    }

    toast.success("Profile updated.");
    router.refresh();
  }

  return (
    <Card className="border-(--color-border-subtle) shadow-(--shadow-sm)">
      <CardHeader>
        <CardTitle>Name & email</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" data-testid="profile-details-form">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={120}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}
          <Button type="submit" loading={loading} data-testid="profile-details-submit">
            Save profile
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

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

    if (newPassword.length < 8) {
      const msg = "New password must be at least 8 characters.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (newPassword !== confirmPassword) {
      const msg = "New passwords do not match.";
      setError(msg);
      toast.error(msg);
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
        const msg = "Your current password is incorrect.";
        setError(msg);
        toast.error(msg);
        return;
      }
      const msg = "Could not update password. Please try again.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess(true);
    toast.success("Your password has been updated — please log back in.");
    // Changing your own password invalidates every existing session
    // (including this one) on its next request — sign out explicitly
    // instead of leaving the user to hit a confusing auth failure on
    // their next click.
    void signOut({ callbackUrl: "/login" });
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
              minLength={8}
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
              minLength={8}
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
