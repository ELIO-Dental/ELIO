"use client";

import * as React from "react";
import { PatientsBulkCheckGcButton } from "./patients-bulk-check-gc-button";
import { PatientsExportButton } from "./patients-export-button";
import { PatientsSyncButton } from "./patients-sync-button";
import { PatientsSyncResultBanner, type PatientsSyncResult } from "./patients-sync-result-banner";

/** Patients list toolbar — sync, bulk GC, export (legacy parity P2.2/P2.5/P2.6). */
export function PatientsListToolbar({
  canSync,
  canBulkGc,
  canExport,
}: {
  canSync: boolean;
  canBulkGc: boolean;
  canExport: boolean;
}) {
  const [syncResult, setSyncResult] = React.useState<PatientsSyncResult | null>(null);

  if (!canSync && !canBulkGc && !canExport) return null;

  return (
    <div className="space-y-3 border-t border-(--color-border) bg-(--color-surface) px-4 py-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canSync && <PatientsSyncButton onComplete={setSyncResult} />}
        {canBulkGc && <PatientsBulkCheckGcButton />}
        {canExport && <PatientsExportButton />}
      </div>
      {syncResult && <PatientsSyncResultBanner result={syncResult} onDismiss={() => setSyncResult(null)} />}
    </div>
  );
}
