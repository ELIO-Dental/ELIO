"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@elio/ui";

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

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);

    const code = (result as any)?.code;
    if (code === "MFA_REQUIRED") {
      setStep("mfa");
      return;
    }
    if (code === "NOT_SUPER_ADMIN") {
      setError("Incorrect email or password.");
      return;
    }
    if (code === "TOO_MANY_ATTEMPTS") {
      setError("Too many attempts. Please wait a while before trying again.");
      return;
    }
    if (result?.error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", { email, password, mfaCode, redirect: false });
    setLoading(false);

    const code = (result as any)?.code;
    if (code === "MFA_REQUIRED") {
      setError("MFA is not set up for this account yet — contact another Super Admin to enable it.");
      return;
    }
    if (code === "MFA_INVALID") {
      setError("Invalid authentication code. Please try again.");
      return;
    }
    if (code === "TOO_MANY_ATTEMPTS") {
      setError("Too many attempts. Please wait a while before trying again.");
      setStep("credentials");
      return;
    }
    if (result?.error) {
      setError("Incorrect email or password.");
      setStep("credentials");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[--color-bg] px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{step === "credentials" ? "ELIO Super Admin" : "Two-factor authentication"}</CardTitle>
          {step === "credentials" && <p className="mt-1 text-body-sm text-[--color-text-secondary]">Internal — ELIO staff only.</p>}
        </CardHeader>
        <CardContent>
          {step === "credentials" ? (
            <form onSubmit={submitCredentials} className="space-y-4" data-testid="login-form">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={error ?? undefined}
                />
              </div>
              <Button type="submit" className="w-full" loading={loading} data-testid="login-submit">
                Sign in
              </Button>
            </form>
          ) : (
            <form onSubmit={submitMfa} className="space-y-4" data-testid="mfa-form">
              <p className="text-body-sm text-[--color-text-secondary]">Enter the 6-digit code from your authenticator app.</p>
              <div>
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
                />
              </div>
              <Button type="submit" className="w-full" loading={loading} data-testid="mfa-submit">
                Verify
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
