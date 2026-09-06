"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
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

interface PlanOption {
  id: string;
  name: string;
  monthlyPricePence: number;
}

export function AddPatientForm({
  plans,
  parentMembers,
}: {
  plans: PlanOption[];
  parentMembers: ParentMemberOption[];
}) {
  const router = useRouter();
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [parentPatientId, setParentPatientId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [signupUrl, setSignupUrl] = React.useState<string | null>(null);

  const selectedPlan = plans.find((p) => p.id === planId);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("First name and last name are required");
      return;
    }
    if (planId) {
      const parentError = validateFreeChildParent(selectedPlan, parentPatientId);
      if (parentError) {
        setError(parentError);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    setSignupUrl(null);
    try {
      const res = await fetch("/plans/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          dateOfBirth: dateOfBirth.trim() || undefined,
          ...(planId ? { planId } : {}),
          ...(parentPatientId ? { parentPatientId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data.error ?? "Failed to create patient";
        toast.error(message);
        setError(message);
        return;
      }
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setDateOfBirth("");
      setPlanId("");
      setParentPatientId("");
      setSignupUrl(data.signupUrl ?? null);
      toast.success(data.planPatient ? "Patient created and enrolled" : "Patient created");
      if (data.planPatient?.id) {
        router.push(`/patients/${data.planPatient.id}`);
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add patient</CardTitle>
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
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="add-first-name">First name</Label>
              <Input
                id="add-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="add-last-name">Last name</Label>
              <Input id="add-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label htmlFor="add-phone">Phone</Label>
              <Input
                id="add-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label htmlFor="add-dob">Date of birth</Label>
              <Input
                id="add-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="add-plan">Plan (optional)</Label>
              <Select
                value={planId || "__none__"}
                onValueChange={(value) => {
                  setPlanId(value === "__none__" ? "" : value);
                  setParentPatientId("");
                }}
              >
                <SelectTrigger id="add-plan">
                  <SelectValue placeholder="No plan yet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No plan yet</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatMoneyGBP(p.monthlyPricePence)}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <ParentMemberSelect
            plans={plans}
            planId={planId}
            parentPatientId={parentPatientId}
            onParentPatientIdChange={setParentPatientId}
            parentMembers={parentMembers}
          />
          {planId && selectedPlan && isFreeChildPlan(selectedPlan) && (
            <p className="rounded-(--radius-md) border border-(--color-success)/30 bg-(--color-success-subtle) p-3 text-body-sm text-(--color-text-primary)">
              Free child plan — patient will be activated immediately with no Direct Debit setup.
            </p>
          )}
          <Button type="submit" loading={submitting}>
            Add patient
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
