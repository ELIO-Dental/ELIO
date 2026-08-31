"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Input, Label } from "@elio/ui";
import { AuthFormCard, AuthShell } from "@/components/auth-shell";

type Step = "credentials" | "mfa";

/**
 * Step 2.3 — Super Admin login. Deliberately separate from apps/shell's
 * /login: this page's `signIn()` call hits THIS app's own origin
 * (/api/auth/callback/credentials), which resolves to the adminAuthConfig
 * NextAuth instance (packages/auth/admin-config.ts) — a completely different
 * session/cookie from apps/shell, per PERFORMANCE_SCALABILITY.md §7's
 * cross-app isolation requirement. MFA is mandatory here (no "skip for now"
 * path) — a MFA_REQUIRED response for an account with mfaEnabled=false is a
 * genuine dead end today (no self-serve enrollment UI exists yet, see
 * packages/db/seed.ts's comment); this page reports that plainly rather than
 * pretending a retry will help.
 */
export default function AdminLoginPage() {
  const router = useRouter();
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

    const code = (result as any)?.code;
    if (code === "MFA_REQUIRED") {
      setLoading(false);
      setStep("mfa");
      return;
    }
    if (code === "NOT_SUPER_ADMIN") {
      setLoading(false);
      setError("Incorrect email or password.");
      return;
    }
    if (code === "TOO_MANY_ATTEMPTS") {
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
    router.push("/");
    router.refresh();
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", { email, password, mfaCode, redirect: false });

    const code = (result as any)?.code;
    if (code === "MFA_REQUIRED") {
      setLoading(false);
      setError("MFA is not set up for this account yet — contact another Super Admin to enable it.");
      return;
    }
    if (code === "MFA_INVALID") {
      setLoading(false);
      setError("Invalid authentication code. Please try again.");
      return;
    }
    if (code === "TOO_MANY_ATTEMPTS") {
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
    router.push("/");
    router.refresh();
  }

  const isBusy = loading || navigating;

  return (
    <AuthShell headline="Sign in" description="Internal ELIO staff access — MFA required after credentials.">
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
