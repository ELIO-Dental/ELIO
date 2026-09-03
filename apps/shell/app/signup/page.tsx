"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button, Input, Label, Stepper, getModuleColor } from "@elio/ui";
import { AuthFormCard, AuthShell } from "@/components/auth-shell";

const STEPS = [
  { id: "practice", label: "Practice" },
  { id: "dentally", label: "Connect Dentally" },
  { id: "modules", label: "Choose modules" },
];

const MODULES: { id: "PAY" | "PLANS" | "FLOW"; name: string; description: string }[] = [
  { id: "PAY", name: "ElioPay", description: "Run payroll & pay periods" },
  { id: "PLANS", name: "ElioPlans", description: "Patient membership plans" },
  { id: "FLOW", name: "ElioFlow", description: "Practice workflow & scheduling" },
];

/** Step 2.1 (MASTER_BUILD_GUIDE.md §2.1, FR-5) — self-serve practice signup. */
export default function SignupPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [practiceName, setPracticeName] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [adminPassword, setAdminPassword] = React.useState("");
  const [dentallyApiKey, setDentallyApiKey] = React.useState("");
  const [dentallyTesting, setDentallyTesting] = React.useState(false);
  const [dentallyTestOk, setDentallyTestOk] = React.useState<boolean | null>(null);
  const [dentallyTestError, setDentallyTestError] = React.useState<string | null>(null);
  const [selectedModules, setSelectedModules] = React.useState<string[]>([]);

  function toggleModule(id: string) {
    setSelectedModules((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function goNext() {
    setError(null);
    if (stepIndex === 0) {
      if (practiceName.trim().length < 2) return setError("Enter your practice name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) return setError("Enter a valid email address.");
      if (adminPassword.length < 10) return setError("Password must be at least 10 characters.");
    }
    setStepIndex((i) => i + 1);
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  async function testDentallyConnection() {
    setError(null);
    setDentallyTestOk(null);
    setDentallyTestError(null);
    const key = dentallyApiKey.trim();
    if (!key) {
      setDentallyTestError("Enter an API key to test.");
      return;
    }
    if (key.length < 8) {
      setDentallyTestError("API key looks too short.");
      return;
    }
    setDentallyTesting(true);
    try {
      const res = await fetch("/api/public/dentally/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setDentallyTestOk(true);
      } else {
        setDentallyTestOk(false);
        setDentallyTestError(data.error ?? "Connection test failed.");
      }
    } catch {
      setDentallyTestOk(false);
      setDentallyTestError("Connection test failed.");
    } finally {
      setDentallyTesting(false);
    }
  }

  async function submit() {
    setError(null);
    if (selectedModules.length === 0) {
      setError("Select at least one module to trial.");
      return;
    }
    setLoading(true);

    const res = await fetch("/api/public/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        practiceName,
        adminEmail,
        adminPassword,
        dentallyApiKey: dentallyApiKey.trim() || undefined,
        selectedModules,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? "Signup failed. Please try again.");
      return;
    }

    // Sign the new OWNER in immediately — no reason to make them re-enter the
    // password they just chose on the very next screen.
    const signInResult = await signIn("credentials", { email: adminEmail, password: adminPassword, redirect: false });
    setLoading(false);
    if (signInResult?.error) {
      router.push("/login");
      return;
    }
    router.push("/launcher");
    router.refresh();
  }

  return (
    <AuthShell wide headline="Create your account" description="Set up your practice and start your ELIO trial in minutes.">
      <AuthFormCard title="Get started">
        <Stepper steps={STEPS} currentIndex={stepIndex} className="mb-8" />
          {stepIndex === 0 && (
            <div className="space-y-4" data-testid="signup-step-practice">
              <div>
                <Label htmlFor="practiceName">Practice name</Label>
                <Input id="practiceName" required value={practiceName} onChange={(e) => setPracticeName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="adminEmail">Admin email</Label>
                <Input id="adminEmail" type="email" autoComplete="email" required value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="adminPassword">Password</Label>
                <Input
                  id="adminPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}
              <Button className="w-full" onClick={goNext} data-testid="signup-next">
                Continue
              </Button>
            </div>
          )}

          {stepIndex === 1 && (
            <div className="space-y-4" data-testid="signup-step-dentally">
              <p className="text-body-sm text-(--color-text-secondary)">
                Enter your practice&apos;s own Dentally API key to sync patients and appointments. You can skip this and connect it later from Settings.
              </p>
              <div>
                <Label htmlFor="dentallyApiKey">Dentally API key</Label>
                <Input
                  id="dentallyApiKey"
                  value={dentallyApiKey}
                  onChange={(e) => {
                    setDentallyApiKey(e.target.value);
                    setDentallyTestOk(null);
                    setDentallyTestError(null);
                  }}
                  placeholder="Optional"
                />
              </div>
              {dentallyApiKey.trim().length > 0 && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={testDentallyConnection}
                    loading={dentallyTesting}
                    data-testid="signup-dentally-test"
                  >
                    Test connection
                  </Button>
                  {dentallyTestOk === true && (
                    <p className="text-body-sm text-(--color-success)" data-testid="signup-dentally-test-ok">
                      Connection successful — your key works with Dentally.
                    </p>
                  )}
                  {dentallyTestError && (
                    <p className="text-body-sm text-(--color-danger)" data-testid="signup-dentally-test-error">
                      {dentallyTestError}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="secondary" onClick={goBack} className="flex-1">
                  Back
                </Button>
                <Button onClick={goNext} className="flex-1" data-testid="signup-next">
                  Continue
                </Button>
              </div>
            </div>
          )}

          {stepIndex === 2 && (
            <div className="space-y-4" data-testid="signup-step-modules">
              <p className="text-body-sm text-(--color-text-secondary)">
                Choose which modules to try. Each starts its own independent 7-day trial.
              </p>
              <div className="space-y-2">
                {MODULES.map((mod) => {
                  const color = getModuleColor(mod.id.toLowerCase() as "pay" | "plans" | "flow");
                  const checked = selectedModules.includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => toggleModule(mod.id)}
                      data-testid={`signup-module-${mod.id.toLowerCase()}`}
                      className="flex w-full items-center gap-3 rounded-(--radius-lg) border p-4 text-left transition-colors"
                      style={{
                        borderColor: checked ? color.hex : "var(--color-border)",
                        backgroundColor: checked ? color.badgeLight.bg : "var(--color-surface)",
                      }}
                    >
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-md) text-body-sm font-semibold"
                        style={{ backgroundColor: color.badgeLight.bg, color: color.badgeLight.fg }}
                      >
                        {mod.name.replace("Elio", "").slice(0, 1)}
                      </span>
                      <span>
                        <span className="block text-body font-medium text-(--color-text-primary)">{mod.name}</span>
                        <span className="block text-body-sm text-(--color-text-secondary)">{mod.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}
              <div className="flex gap-3">
                <Button variant="secondary" onClick={goBack} className="flex-1">
                  Back
                </Button>
                <Button onClick={submit} loading={loading} className="flex-1" data-testid="signup-submit">
                  Create account
                </Button>
              </div>
            </div>
          )}
      </AuthFormCard>
      <p className="mt-6 text-center text-body-sm text-(--color-text-secondary)">
        Already have an account?{" "}
        <a href="/login" className="font-medium text-(--color-primary-600) hover:underline" data-testid="signin-link">
          Sign in
        </a>
      </p>
    </AuthShell>
  );
}
