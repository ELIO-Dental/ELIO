"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  formatMoneyGBP,
  toast,
} from "@elio/ui";
import { ParentMemberSelect, validateFreeChildParent, type ParentMemberOption } from "./parent-member-select";
import { isFreeChildPlan } from "@/lib/patient-list-filters";

interface CorePatient {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface PlanOption {
  id: string;
  name: string;
  monthlyPricePence: number;
}

export function EnrolPatientForm({
  patients,
  plans,
  parentMembers,
  initialPatientId,
}: {
  patients: CorePatient[];
  plans: PlanOption[];
  parentMembers: ParentMemberOption[];
  /** Pre-fill from a cross-module handoff (ElioFlow's "Start ElioPlans
   * signup" button, APPLICATION_FLOW.md §8/§12 — UI shortcut only, this
   * component still submits through the normal enrolment route). */
  initialPatientId?: string;
}) {
  const router = useRouter();
  const [patientId, setPatientId] = React.useState<string>(initialPatientId ?? "");
  const [planId, setPlanId] = React.useState<string>("");
  const [parentPatientId, setParentPatientId] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [signupUrl, setSignupUrl] = React.useState<string | null>(null);

  const selectedPlan = plans.find((p) => p.id === planId);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!patientId || !planId) {
      setError("Choose a patient and a plan");
      return;
    }
    const parentError = validateFreeChildParent(selectedPlan, parentPatientId);
    if (parentError) {
      setError(parentError);
      return;
    }
    setSubmitting(true);
    setError(null);
    setSignupUrl(null);
    try {
      const res = await fetch("/plans/api/enrolments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          planId,
          ...(parentPatientId ? { parentPatientId } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.error ?? "Failed to enrol patient";
        toast.error(message);
        setError(message);
        return;
      }
      const data = await res.json();
      setPatientId("");
      setPlanId("");
      setParentPatientId("");
      setSignupUrl(data.signupUrl);
      toast.success("Patient enrolled");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (patients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Enrol a patient</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-(--color-text-secondary)">
            No unenrolled patients found from the synced patient list.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enrol a patient</CardTitle>
      </CardHeader>
      <CardContent>
        {signupUrl && (
          <p className="mb-4 rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface-subtle) p-3 text-body-sm text-(--color-text-primary)">
            Signup link ready — send this to the patient:{" "}
            <a href={signupUrl} className="text-(--color-primary-600) underline" target="_blank" rel="noreferrer">
              {typeof window !== "undefined" ? `${window.location.origin}${signupUrl}` : signupUrl}
            </a>
          </p>
        )}
        {planId && selectedPlan && isFreeChildPlan(selectedPlan) && !signupUrl && (
          <p className="mb-4 rounded-(--radius-md) border border-(--color-success)/30 bg-(--color-success-subtle) p-3 text-body-sm text-(--color-text-primary)">
            Free child plan — patient will be activated immediately with no Direct Debit setup.
          </p>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
            <div>
              <Label htmlFor="patient">Patient</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger id="patient">
                  <SelectValue placeholder="Select patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="plan">Plan</Label>
              <Select
                value={planId}
                onValueChange={(value) => {
                  setPlanId(value);
                  setParentPatientId("");
                }}
              >
                <SelectTrigger id="plan">
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatMoneyGBP(p.monthlyPricePence)}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button type="submit" loading={submitting}>
                Enrol patient
              </Button>
            </div>
          </div>
          <ParentMemberSelect
            plans={plans}
            planId={planId}
            parentPatientId={parentPatientId}
            onParentPatientIdChange={setParentPatientId}
            parentMembers={parentMembers}
          />
        </form>
      </CardContent>
    </Card>
  );
}
