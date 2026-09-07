"use client";

import * as React from "react";
import { Plus, UserPlus, ChevronUp } from "lucide-react";
import { Button } from "@elio/ui";
import { AddPatientForm } from "./add-patient-form";
import { EnrolPatientForm } from "./enrol-patient-form";
import type { ParentMemberOption } from "./parent-member-select";

interface PlanOption {
  id: string;
  name: string;
  monthlyPricePence: number;
}

interface CorePatient {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

/**
 * Legacy used a compact Add dialog; Elio keeps full forms but collapsed by default
 * so the patients table is the first viewport (AuraPay-style density).
 */
export function PatientsEnrolSection({
  canInvite,
  plans,
  parentMembers,
  unenrolledPatients,
  initialPatientId,
  fromFlow,
  openEnrol = false,
}: {
  canInvite: boolean;
  plans: PlanOption[];
  parentMembers: ParentMemberOption[];
  unenrolledPatients: CorePatient[];
  initialPatientId?: string;
  fromFlow?: boolean;
  openEnrol?: boolean;
}) {
  const [open, setOpen] = React.useState(Boolean(fromFlow) || openEnrol);

  React.useEffect(() => {
    if (fromFlow || openEnrol) setOpen(true);
  }, [fromFlow, openEnrol]);

  return (
    <div className="mt-6" id={fromFlow ? "enrol-section" : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={open ? "secondary" : "primary"}
          size="sm"
          onClick={() => setOpen((v) => !v)}
          data-testid="toggle-add-enrol"
        >
          {open ? <ChevronUp className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {open ? "Hide forms" : "Add / Enrol patient"}
        </Button>
        {!open ? (
          <p className="text-caption text-(--color-text-tertiary)">
            Add from Dentally or manually, or enrol an existing practice patient.
          </p>
        ) : null}
      </div>

      {open ? (
        <div className={`mt-4 ${canInvite ? "grid gap-6 lg:grid-cols-2" : ""}`}>
          {canInvite ? (
            <AddPatientForm plans={plans} parentMembers={parentMembers} />
          ) : null}
          <EnrolPatientForm
            patients={unenrolledPatients}
            plans={plans}
            parentMembers={parentMembers}
            initialPatientId={initialPatientId}
            highlightFromFlow={Boolean(fromFlow)}
          />
        </div>
      ) : null}

      {open && canInvite ? (
        <p className="mt-3 flex items-center gap-1.5 text-caption text-(--color-text-tertiary)">
          <UserPlus className="size-3.5" aria-hidden />
          After enrol, use Invite / Setup DD on the row or open the patient.
        </p>
      ) : null}
    </div>
  );
}
