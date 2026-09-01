"use client";

import * as React from "react";
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@elio/ui";
import { isFreeChildPlan } from "@/lib/patient-list-filters";

export type ParentMemberOption = {
  id: string;
  firstName: string | null;
  lastName: string | null;
};

type PlanOption = {
  id: string;
  name: string;
  monthlyPricePence: number;
};

/** Parent/guardian picker shown when enrolling on a free (£0) child plan (P2.8). */
export function ParentMemberSelect({
  plans,
  planId,
  parentPatientId,
  onParentPatientIdChange,
  parentMembers,
}: {
  plans: PlanOption[];
  planId: string;
  parentPatientId: string;
  onParentPatientIdChange: (value: string) => void;
  parentMembers: ParentMemberOption[];
}) {
  const selectedPlan = plans.find((p) => p.id === planId);
  if (!selectedPlan || !isFreeChildPlan(selectedPlan)) return null;

  return (
    <div className="space-y-2">
      <Label htmlFor="parent-member" className="flex items-center gap-1">
        Link to parent/guardian <span className="text-(--color-danger)">*</span>
      </Label>
      <Select value={parentPatientId || "none"} onValueChange={(v) => onParentPatientIdChange(v === "none" ? "" : v)}>
        <SelectTrigger id="parent-member" className={!parentPatientId ? "border-(--color-warning)" : ""}>
          <SelectValue placeholder="Select parent/guardian…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" disabled>
            Select parent/guardian…
          </SelectItem>
          {parentMembers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {[p.firstName, p.lastName].filter(Boolean).join(" ") || p.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!parentPatientId && (
        <p className="text-caption font-medium text-(--color-warning)">
          Required — children on a free plan must be linked to an adult member.
        </p>
      )}
      <p className="text-caption text-(--color-text-tertiary)">
        Free plan — no Direct Debit needed. Patient will be activated immediately.
      </p>
    </div>
  );
}

export function validateFreeChildParent(plan: PlanOption | undefined, parentPatientId: string): string | null {
  if (plan && isFreeChildPlan(plan) && !parentPatientId) {
    return "Please link this patient to a parent/guardian. Children on a free plan must be linked to an adult member.";
  }
  return null;
}
