"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@elio/ui";

type Step = "credentials" | "mfa";

/**
 * Only ever redirect to a same-origin, relative path after login — the
 * `callbackUrl` query param is attacker-controlled (a crafted /login?callbackUrl=
 * link), so an absolute/protocol-relative URL here would be an open redirect
 * (e.g. https://evil.com or //evil.com). Reject anything that isn't a plain
 * relative path starting with a single "/".
 */
function sanitizeCallbackUrl(raw: string | null): string {
  if (!raw) return "/launcher";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/launcher";
  try {
    // Guards against odd encodings like "/\t/evil.com" or "/%09/evil.com" that
    // browsers/decoders can normalize into a scheme-relative URL.
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

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if ((result as any)?.code === "MFA_REQUIRED") {
      setStep("mfa");
      return;
    }
    if ((result as any)?.code === "TOO_MANY_ATTEMPTS") {
      setError("Too many attempts. Please wait a while before trying again.");
      return;
    }
    if (result?.error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      mfaCode,
      redirect: false,
    });

    setLoading(false);

    if ((result as any)?.code === "MFA_INVALID") {
      setError("Invalid authentication code. Please try again.");
      return;
    }
    if ((result as any)?.code === "TOO_MANY_ATTEMPTS") {
      setError("Too many attempts. Please wait a while before trying again.");
      setStep("credentials");
      return;
    }
    if (result?.error) {
      setError("Incorrect email or password.");
      setStep("credentials");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[--color-bg] px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{step === "credentials" ? "Sign in to ELIO" : "Two-factor authentication"}</CardTitle>
        </CardHeader>
        <CardContent>
          {step === "credentials" ? (
            <form onSubmit={submitCredentials} className="space-y-4" data-testid="login-form">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
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
                />
              </div>
              <Button type="submit" className="w-full" loading={loading} data-testid="login-submit">
                Sign in
              </Button>
              <div className="text-center">
                <a href="/forgot-password" className="text-body-sm text-[--color-primary-600] hover:underline" data-testid="forgot-password-link">
                  Forgot your password?
                </a>
              </div>
            </form>
          ) : (
            <form onSubmit={submitMfa} className="space-y-4" data-testid="mfa-form">
              <p className="text-body-sm text-[--color-text-secondary]">
                Enter the 6-digit code from your authenticator app.
              </p>
              <div>
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
                />
              </div>
              <Button type="submit" className="w-full" loading={loading} data-testid="mfa-submit">
                Verify
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  className="text-body-sm text-[--color-text-secondary] hover:underline"
                  onClick={() => {
                    setStep("credentials");
                    setError(null);
                  }}
                >
                  Back
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
