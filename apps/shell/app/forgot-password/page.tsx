"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@elio/ui";

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
    <div className="flex min-h-screen items-center justify-center bg-(--color-bg) px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <p className="text-body-sm text-(--color-text-secondary)" data-testid="forgot-password-confirmation">
              If an account exists for that email, we&apos;ve sent a link to reset your password. It expires in 1
              hour.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" data-testid="forgot-password-form">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" loading={loading} data-testid="forgot-password-submit">
                Send reset link
              </Button>
              <div className="text-center">
                <a href="/login" className="text-body-sm text-(--color-primary-600) hover:underline">
                  Back to sign in
                </a>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
