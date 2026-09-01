"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Stepper,
  SuccessCheck,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Label,
  Skeleton,
  useSkeleton,
  formatMoneyGBP,
} from "@elio/ui";
import { AlertCircle, RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// Types (mirror the /api/public/signup/[token] response shape)
// ---------------------------------------------------------------------------

interface SignupData {
  patient: { firstName: string; lastName: string; email: string; dateOfBirth: string | null };
  plan: {
    id: string;
    name: string;
    monthlyPricePence: number;
    publicDescription?: string | null;
    inclusions: { name: string; quantity?: number | null; period?: string | null }[];
    discounts: { name: string; percentage: number }[];
  } | null;
  document: { id: string; title: string; content: string; version: string } | null;
  alreadySigned: boolean;
  hasMandate: boolean;
  enrolmentStatus: string | null;
  branding?: {
    brandName: string;
    tagline: string;
    logoUrl: string;
    faviconUrl: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
}

const STEPS = [
  { id: "details", label: "Your details" },
  { id: "terms", label: "Terms" },
  { id: "mandate", label: "Direct Debit" },
  { id: "done", label: "Complete" },
];

function PublicSignupContent() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const searchParams = useSearchParams();
  const billingRequestId = searchParams.get("billing_request_id") ?? searchParams.get("billing_request");

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<SignupData | null>(null);
  const showSkeleton = useSkeleton(loading);

  const [stepIndex, setStepIndex] = React.useState(0);

  // F.4 Final QA (2026-08-29): eslint(react-hooks/set-state-in-effect) flags
  // synchronous setState reachable from an effect's body, even through an
  // intermediate function call — see apps/shell/app/settings/team/
  // team-client.tsx's identical comment for the full rationale. `runFetch`
  // is the shared "do the actual request and apply its result" logic;
  // `fetchData` (used by the "Retry" button below, where a synchronous
  // loading/error reset is correct) wraps it with that reset, while the
  // effect calls `runFetch` directly — `loading`/`loadError` already start
  // at their correct initial values (true/null) via useState above, and
  // this effect only runs once for the lifetime of this page (`token` is a
  // route param from useParams(), never reassigned in place), so it never
  // needed that reset in the first place.
  const runFetch = React.useCallback(() => {
    return fetch(`/plans/api/public/signup/${token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) {
          setLoadError(body.error ?? "This signup link could not be loaded.");
          return;
        }
        setData(body);
        if (body.hasMandate) setStepIndex(3);
        else if (body.alreadySigned) setStepIndex(2);
      })
      .catch(() => setLoadError("Could not reach the server. Check your connection and retry."))
      .finally(() => setLoading(false));
  }, [token]);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    setLoadError(null);
    runFetch();
  }, [runFetch]);

  React.useEffect(() => {
    if (!token) return;
    runFetch();
  }, [token, runFetch]);

  // Returning from GoCardless's Billing Request Flow: try the redirect-based
  // resolve first (fast path, works when GoCardless's redirect actually
  // carries billing_request_id — which in practice it often doesn't; per
  // GoCardless's own docs, "Don't rely on the redirect back to your site to
  // confirm the outcome. Always use webhooks."). Either way, once we're back
  // on this page past the mandate step, poll the signup data for a short
  // window until the webhook (the real, authoritative path — see
  // handleBillingRequestEvent in plans-service.ts) has recorded the mandate,
  // then advance. Found live (2026-08-28): without this poll, a patient who
  // completed a real mandate stayed stuck on step 3 indefinitely, since the
  // billing_request_id param this effect used to depend on never actually
  // arrived on the redirect.
  React.useEffect(() => {
    if (!token || stepIndex !== 2) return;

    if (billingRequestId) {
      fetch(`/plans/api/public/signup/${token}/mandate/callback?billing_request_id=${encodeURIComponent(billingRequestId)}`)
        .then((res) => res.json())
        .then((body) => {
          if (body?.status === "confirmed") setStepIndex(3);
        })
        .catch(() => {});
    }

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 15; // ~30s at 2s intervals — generous for a webhook round-trip
    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const res = await fetch(`/plans/api/public/signup/${token}`);
        const body = await res.json().catch(() => ({}));
        if (body?.hasMandate) {
          setStepIndex(3);
          return;
        }
      } catch {
        // transient — keep polling until MAX_ATTEMPTS
      }
      if (!cancelled && attempts < MAX_ATTEMPTS) setTimeout(poll, 2000);
    };
    const timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, billingRequestId, stepIndex]);

  return (
    <div className="min-h-screen bg-(--color-bg) px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 text-center">
          {data?.branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.branding.logoUrl} alt={data.branding.brandName} className="mx-auto mb-3 h-12 object-contain" />
          ) : null}
          <h1
            className="text-h2 text-(--color-text-primary)"
            style={data?.branding?.primaryColor ? { color: data.branding.primaryColor } : undefined}
          >
            {data?.branding?.brandName ?? "ELIO Plans"}
          </h1>
          <p className="mt-1 text-body-sm text-(--color-text-secondary)">
            {data?.branding?.tagline ?? "Complete your membership signup"}
          </p>
        </div>

        {stepIndex < STEPS.length - 1 && (
          <div className="mb-8">
            <Stepper steps={STEPS} currentIndex={stepIndex} />
          </div>
        )}

        {showSkeleton && (
          <Card>
            <CardContent className="space-y-3 pt-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        )}

        {!loading && loadError && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertCircle className="size-10 text-(--color-danger)" aria-hidden />
              <p className="text-h3 text-(--color-text-primary)">Signup link problem</p>
              <p className="text-body-sm text-(--color-text-secondary)">{loadError}</p>
              <Button variant="secondary" size="sm" onClick={fetchData} className="mt-2">
                <RefreshCw className="size-4" aria-hidden />
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !loadError && data && (
          <SignupSteps token={token} data={data} stepIndex={stepIndex} setStepIndex={setStepIndex} />
        )}
      </div>
    </div>
  );
}

export default function PublicSignupPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-(--color-bg) px-4 py-10">
          <div className="mx-auto w-full max-w-xl">
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      }
    >
      <PublicSignupContent />
    </React.Suspense>
  );
}

// ---------------------------------------------------------------------------
// Step content
// ---------------------------------------------------------------------------

function SignupSteps({
  token,
  data,
  stepIndex,
  setStepIndex,
}: {
  token: string;
  data: SignupData;
  stepIndex: number;
  setStepIndex: (i: number) => void;
}) {
  if (stepIndex === 0) {
    return <DetailsStep data={data} onNext={() => setStepIndex(1)} />;
  }
  if (stepIndex === 1) {
    return <TermsStep token={token} data={data} onNext={() => setStepIndex(2)} />;
  }
  if (stepIndex === 2) {
    return <MandateStep token={token} onDone={() => setStepIndex(3)} />;
  }
  return <CompleteStep />;
}

function DetailsStep({ data, onNext }: { data: SignupData; onNext: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome, {data.patient.firstName || "there"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-body-sm text-(--color-text-secondary)">
          Please confirm your details below before continuing.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="signup-first-name">First name</Label>
            <Input id="signup-first-name" value={data.patient.firstName} disabled />
          </div>
          <div>
            <Label htmlFor="signup-last-name">Last name</Label>
            <Input id="signup-last-name" value={data.patient.lastName} disabled />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="signup-email">Email</Label>
            <Input id="signup-email" value={data.patient.email} disabled />
          </div>
        </div>

        {data.plan && (
          <div className="rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-bg-subtle) p-4">
            <div className="flex items-center justify-between">
              <span className="text-h3 text-(--color-text-primary)">{data.plan.name}</span>
              <span className="text-h3 text-(--color-primary-600)">{formatMoneyGBP(data.plan.monthlyPricePence)}/mo</span>
            </div>
            {data.plan.publicDescription && (
              <p className="mt-1 text-body-sm text-(--color-text-secondary)">{data.plan.publicDescription}</p>
            )}
            {data.plan.inclusions.length > 0 && (
              <ul className="mt-3 space-y-1 text-body-sm text-(--color-text-secondary)">
                {data.plan.inclusions.map((inc, idx) => (
                  <li key={idx}>
                    • {inc.quantity && inc.period ? `${inc.quantity}x ${inc.name} per ${inc.period}` : inc.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Button className="w-full" onClick={onNext}>
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}

function TermsStep({ token, data, onNext }: { token: string; data: SignupData; onNext: () => void }) {
  const [signedName, setSignedName] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    if (!signedName.trim() || !agreed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/plans/api/public/signup/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureData: signedName.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not record your signature. Please retry.");
        return;
      }
      onNext();
    } catch {
      setError("Network error while submitting. Please retry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Terms &amp; Conditions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.document ? (
          <>
            <div className="max-h-64 overflow-y-auto rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-bg-subtle) p-4 text-body-sm text-(--color-text-secondary)">
              <p className="mb-2 text-caption text-(--color-text-tertiary)">Version {data.document.version}</p>
              <div dangerouslySetInnerHTML={{ __html: data.document.content }} />
            </div>
            <label className="flex items-start gap-3 text-body-sm text-(--color-text-secondary)">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-(--color-primary-500)"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              I have read and agree to the {data.document.title}.
            </label>
            <div>
              <Label htmlFor="signup-signature">Type your full name to sign</Label>
              <Input
                id="signup-signature"
                value={signedName}
                onChange={(e) => setSignedName(e.target.value)}
                placeholder={`${data.patient.firstName} ${data.patient.lastName}`.trim()}
              />
            </div>
          </>
        ) : (
          <p className="text-body-sm text-(--color-danger)">
            No terms document is available for this plan. Please contact the practice.
          </p>
        )}

        {error && (
          <p className="flex items-center gap-2 text-body-sm text-(--color-danger)">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <Button
          className="w-full"
          disabled={!data.document || !agreed || !signedName.trim()}
          loading={submitting}
          onClick={submit}
        >
          Agree &amp; continue
        </Button>
      </CardContent>
    </Card>
  );
}

// THEME_GUIDELINE §6.6: a real-money step. Show loading only past the
// debounce threshold, and never let a slow mandate step silently do
// nothing — a clear retry fallback on failure so the patient never
// wonders whether their click registered and double-clicks into a
// second mandate attempt.
function MandateStep({ token, onDone }: { token: string; onDone: () => void }) {
  const [status, setStatus] = React.useState<"idle" | "starting" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const showBusy = useSkeleton(status === "starting");

  const start = async () => {
    setStatus("starting");
    setError(null);
    try {
      const origin = window.location.origin;
      const res = await fetch(`/plans/api/public/signup/${token}/mandate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // No pre-existing query string here — GoCardless appends its own
          // "?billing_request_id=..." to whatever redirectUri we give it.
          // Found live: with a query string already present (the earlier
          // "?step=mandate-callback"), the appended param produced a second
          // literal "?" in the URL, which browsers don't parse as a new
          // delimiter — billing_request_id never came through as a real
          // query param, so the callback effect below silently never fired
          // and the page stayed stuck on the Direct Debit step even after a
          // real mandate was created on GoCardless's side. The effect
          // already keys purely off billingRequestId's presence, so no
          // "step" marker is actually needed.
          redirectUri: `${origin}/plans/signup/${token}`,
          exitUri: `${origin}/plans/signup/${token}`,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setError(body.error ?? "Could not start Direct Debit setup. Please retry.");
        return;
      }
      const authUrl: string | undefined = body?.flow?.authorisation_url;
      if (!authUrl) {
        setStatus("error");
        setError("GoCardless did not return a redirect link. Please retry.");
        return;
      }
      window.location.href = authUrl;
    } catch {
      setStatus("error");
      setError("Network error starting Direct Debit setup. Please retry.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up Direct Debit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body-sm text-(--color-text-secondary)">
          You&apos;ll be redirected to our secure payment provider, GoCardless, to set up your Direct Debit
          mandate. This is a real-money step — please don&apos;t click more than once.
        </p>

        {status === "error" && (
          <p className="flex items-center gap-2 text-body-sm text-(--color-danger)">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <Button className="w-full" loading={showBusy} disabled={status === "starting"} onClick={start}>
          {status === "error" ? "Retry Direct Debit setup" : "Set up Direct Debit"}
        </Button>

        {/* Fallback: this step's own manual "I've completed it" path exists
            for a patient returning from GoCardless when the browser redirect
            back didn't fire cleanly (mobile browser tab switch, etc). */}
        <button
          type="button"
          className="w-full text-center text-caption text-(--color-text-tertiary) underline-offset-2 hover:underline"
          onClick={onDone}
        >
          I already completed Direct Debit setup
        </button>
      </CardContent>
    </Card>
  );
}

function CompleteStep() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <SuccessCheck />
        <p className="text-h2 text-(--color-text-primary)">You&apos;re all set</p>
        <p className="max-w-sm text-body-sm text-(--color-text-secondary)">
          Your membership signup is complete and your Direct Debit is being set up. You&apos;ll receive a
          confirmation email shortly.
        </p>
      </CardContent>
    </Card>
  );
}
