"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, toast } from "@elio/ui";

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
    toast.success("Your password has been updated.");
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
