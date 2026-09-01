"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@elio/ui";
import { Download } from "lucide-react";

/** Export current filtered patients list as CSV (P2.5). */
export function PatientsExportButton() {
  const searchParams = useSearchParams();

  function handleExport() {
    const params = new URLSearchParams();
    const q = searchParams.get("q");
    const status = searchParams.get("status");
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const query = params.toString();
    window.location.href = `/plans/api/patients/export${query ? `?${query}` : ""}`;
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleExport}>
      <Download className="mr-2 size-4" />
      Export CSV
    </Button>
  );
}
