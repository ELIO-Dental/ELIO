"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { Button, Input, Label, toast, queueFlashToast } from "@elio/ui";
import { AuthFormCard, AuthShell } from "@/components/auth-shell";

type Step = "credentials" | "mfa";

function authErrorCode(result: unknown): string | undefined {
  const r = result as { code?: string; error?: string } | null;
  return r?.code ?? (r?.error && r.error !== "CredentialsSignin" ? r.error : undefined);
}

export default function AdminLoginPage() {
  const [step, setStep] = React.useState<Step>("credentials");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mfaCode, setMfaCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [navigating, setNavigating] = React.useState(false);

  function fail(message: string) {
    setLoading(false);
    setError(message);
    toast.error(message);
  }

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      const err = authErrorCode(result);

      if (err === "MFA_REQUIRED") {
        setLoading(false);
        setStep("mfa");
        toast.info("Enter the 6-digit code from your authenticator app.");
        return;
      }
      if (err === "NOT_SUPER_ADMIN") {
        fail("This account is not a Super Admin. Use ELIO Portal to sign in.");
        return;
      }
      if (err === "TOO_MANY_ATTEMPTS") {
        fail("Too many attempts. Please wait a while before trying again.");
        return;
      }
      if (!result?.ok) {
        fail("Incorrect email or password.");
        return;
      }

      setNavigating(true);
      queueFlashToast("success", "Signed in", "Welcome to ELIO Admin.");
      window.location.assign("/settings");
    } catch {
      fail("Could not reach the server. Check your connection and try again.");
    }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn("credentials", { email, password, mfaCode, redirect: false });
      const err = authErrorCode(result);

      if (err === "MFA_REQUIRED") {
        fail("Complete authenticator setup under Settings after signing in.");
        setStep("credentials");
        return;
      }
      if (err === "MFA_INVALID") {
        fail("Invalid authentication code. Please try again.");
        return;
      }
      if (err === "TOO_MANY_ATTEMPTS") {
        fail("Too many attempts. Please wait a while before trying again.");
        setStep("credentials");
        return;
      }
      if (!result?.ok) {
        fail("Incorrect email or password.");
        setStep("credentials");
        return;
      }

      setNavigating(true);
      queueFlashToast("success", "Signed in", "Welcome to ELIO Admin.");
      window.location.assign("/");
    } catch {
      fail("Could not reach the server. Check your connection and try again.");
    }
  }

  const isBusy = loading || navigating;

  return (
    <AuthShell
      headline="Sign in"
      description={
        step === "credentials"
          ? "Internal ELIO staff access. First-time sign-in continues to Settings to add your authenticator."
          : "Enter the 6-digit code from your authenticator app."
      }
    >
      <AuthFormCard title={step === "credentials" ? "Super Admin" : "Two-factor authentication"}>
        {step === "credentials" ? (
          <form onSubmit={submitCredentials} className="space-y-5" data-testid="login-form">
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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={error ?? undefined}
                className="h-12"
              />
            </div>
            <Button type="submit" className="h-12 w-full text-body" loading={isBusy} data-testid="login-submit">
              Sign in
            </Button>
          </form>
        ) : (
          <form onSubmit={submitMfa} className="space-y-5" data-testid="mfa-form">
            <p className="text-body text-(--color-text-secondary)">Enter the 6-digit code from your authenticator app.</p>
            <div className="space-y-2">
              <Label htmlFor="mfaCode">Authentication code</Label>
              <Input
                id="mfaCode"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                error={error ?? undefined}
                className="h-12 text-center text-h3 tracking-[0.35em]"
              />
            </div>
            <Button type="submit" className="h-12 w-full text-body" loading={isBusy} data-testid="mfa-submit">
              Verify
            </Button>
            <div className="text-center">
              <button
                type="button"
                className="text-body-sm font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) hover:underline"
                onClick={() => {
                  setStep("credentials");
                  setError(null);
                }}
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </AuthFormCard>
    </AuthShell>
  );
}
