"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Input, Label } from "@elio/ui";
import { AuthFormCard, AuthShell } from "@/components/auth-shell";

type Step = "credentials" | "mfa";

function sanitizeCallbackUrl(raw: string | null): string {
  if (!raw) return "/launcher";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/launcher";
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("//") || /^\/\s*[\\/]/i.test(decoded)) return "/launcher";
  } catch {
    return "/launcher";
  }
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = sanitizeCallbackUrl(searchParams.get("callbackUrl"));

  const [step, setStep] = React.useState<Step>("credentials");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mfaCode, setMfaCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [navigating, setNavigating] = React.useState(false);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", { email, password, redirect: false });

    if ((result as any)?.code === "MFA_REQUIRED") {
      setLoading(false);
      setStep("mfa");
      return;
    }
    if ((result as any)?.code === "TOO_MANY_ATTEMPTS") {
      setLoading(false);
      setError("Too many attempts. Please wait a while before trying again.");
      return;
    }
    if (result?.error) {
      setLoading(false);
      setError("Incorrect email or password.");
      return;
    }

    setNavigating(true);
    router.push(callbackUrl);
    router.refresh();
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", { email, password, mfaCode, redirect: false });

    if ((result as any)?.code === "MFA_INVALID") {
      setLoading(false);
      setError("Invalid authentication code. Please try again.");
      return;
    }
    if ((result as any)?.code === "TOO_MANY_ATTEMPTS") {
      setLoading(false);
      setError("Too many attempts. Please wait a while before trying again.");
      setStep("credentials");
      return;
    }
    if (result?.error) {
      setLoading(false);
      setError("Incorrect email or password.");
      setStep("credentials");
      return;
    }

    setNavigating(true);
    router.push(callbackUrl);
    router.refresh();
  }

  const isBusy = loading || navigating;

  return (
    <AuthShell headline="Welcome back" description="Sign in to access your ELIO practice suite.">
      <AuthFormCard title={step === "credentials" ? "Sign in" : "Two-factor authentication"}>
        {step === "credentials" ? (
          <form onSubmit={submitCredentials} className="space-y-5" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
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
                name="password"
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
            <div className="text-center">
              <a href="/forgot-password" className="text-body-sm font-medium text-(--color-primary-600) hover:underline" data-testid="forgot-password-link">
                Forgot your password?
              </a>
            </div>
          </form>
        ) : (
          <form onSubmit={submitMfa} className="space-y-5" data-testid="mfa-form">
            <p className="text-body text-(--color-text-secondary)">Enter the 6-digit code from your authenticator app.</p>
            <div className="space-y-2">
              <Label htmlFor="mfaCode">Authentication code</Label>
              <Input
                id="mfaCode"
                name="mfaCode"
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
