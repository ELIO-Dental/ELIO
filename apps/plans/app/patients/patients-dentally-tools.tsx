"use client";

import * as React from "react";
import { ImportFromDentally } from "./import-from-dentally";
import type { ParentMemberOption } from "./parent-member-select";

type PlanOption = {
  id: string;
  name: string;
  monthlyPricePence: number;
};

/** Dentally import card (P2.4). */
export function PatientsDentallyTools({
  plans,
  parentMembers,
}: {
  plans: PlanOption[];
  parentMembers: ParentMemberOption[];
}) {
  return <ImportFromDentally plans={plans} parentMembers={parentMembers} />;
}
