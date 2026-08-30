"use client";

import * as React from "react";
import { Button, Input, Label } from "@elio/ui";
import { AuthFormCard, AuthShell } from "@/components/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSubmitted(true);
  }

  return (
    <AuthShell headline="Reset password" description="We'll email you a secure link to choose a new password.">
      <AuthFormCard title="Forgot your password?">
        {submitted ? (
          <p className="text-body leading-relaxed text-(--color-text-secondary)" data-testid="forgot-password-confirmation">
            If an account exists for that email, we&apos;ve sent a link to reset your password. It expires in 1 hour.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5" data-testid="forgot-password-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12"
              />
            </div>
            <Button type="submit" className="h-12 w-full" loading={loading} data-testid="forgot-password-submit">
              Send reset link
            </Button>
            <div className="text-center">
              <a href="/login" className="text-body-sm font-medium text-(--color-primary-600) hover:underline">
                Back to sign in
              </a>
            </div>
          </form>
        )}
      </AuthFormCard>
    </AuthShell>
  );
}
