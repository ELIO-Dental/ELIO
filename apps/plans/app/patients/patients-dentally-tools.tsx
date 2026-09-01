"use client";

import * as React from "react";
import { ImportFromDentally } from "./import-from-dentally";
import { PatientsSyncButton } from "./patients-sync-button";
import { PatientsSyncResultBanner, type PatientsSyncResult } from "./patients-sync-result-banner";

type PlanOption = {
  id: string;
  name: string;
  monthlyPricePence: number;
};

/** Sync toolbar, result banner, and Dentally import (P2.2 + P2.4). */
export function PatientsDentallyTools({ plans }: { plans: PlanOption[] }) {
  const [syncResult, setSyncResult] = React.useState<PatientsSyncResult | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <PatientsSyncButton onComplete={setSyncResult} />
      </div>
      {syncResult && <PatientsSyncResultBanner result={syncResult} onDismiss={() => setSyncResult(null)} />}
      <ImportFromDentally plans={plans} />
    </div>
  );
}
