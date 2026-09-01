"use client";

import * as React from "react";
import { ImportFromDentally } from "./import-from-dentally";

type PlanOption = {
  id: string;
  name: string;
  monthlyPricePence: number;
};

/** Dentally import card (P2.4). */
export function PatientsDentallyTools({ plans }: { plans: PlanOption[] }) {
  return <ImportFromDentally plans={plans} />;
}
