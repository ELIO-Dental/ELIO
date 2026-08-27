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
} from "@elio/ui";

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
  initialPatientId,
}: {
  patients: CorePatient[];
  plans: PlanOption[];
  /** Pre-fill from a cross-module handoff (ElioFlow's "Start ElioPlans
   * signup" button, APPLICATION_FLOW.md §8/§12 — UI shortcut only, this
   * component still submits through the normal enrolment route). */
  initialPatientId?: string;
}) {
  const router = useRouter();
  const [patientId, setPatientId] = React.useState<string>(initialPatientId ?? "");
  const [planId, setPlanId] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!patientId || !planId) {
      setError("Choose a patient and a plan");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/plans/api/enrolments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, planId }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to enrol patient");
      return;
    }
    setPatientId("");
    setPlanId("");
    router.refresh();
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
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
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
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger id="plan">
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — £{(p.monthlyPricePence / 100).toFixed(2)}/mo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            {error && <p className="mb-2 text-body-sm text-(--color-danger)">{error}</p>}
            <Button type="submit" loading={submitting}>
              Enrol patient
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
