"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@elio/ui";
import type { Dentist } from "@elio/db";

/**
 * Runs the pay-engine for every dentist in the practice against this pay period, then
 * (once payslips exist) offers to lock it. Kept intentionally simple for this pass: private
 * revenue is entered as a flat manual total per dentist (see calculate route's KNOWN GAP
 * doc-comment — Treatment isn't yet attributable to a dentist from the live Dentally sync).
 */
export function CalculateAndLockPanel({
  payPeriodId,
  dentists,
  locked,
}: {
  payPeriodId: string;
  dentists: Pick<Dentist, "id" | "name" | "payType">[];
  locked: boolean;
}) {
  const router = useRouter();
  const [privateRevenue, setPrivateRevenue] = React.useState<Record<string, string>>({});
  const [running, setRunning] = React.useState(false);
  const [locking, setLocking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function runCalculation() {
    setRunning(true);
    setError(null);
    const body = {
      dentists: dentists.map((d) => ({
        dentistId: d.id,
        privateRevenueItems: privateRevenue[d.id]
          ? [{ amountPence: Math.round(Number(privateRevenue[d.id]) * 100), excludedAsConsultation: false }]
          : [],
      })),
    };
    const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setRunning(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Calculation failed");
      return;
    }
    router.refresh();
  }

  async function lock() {
    setLocking(true);
    setError(null);
    const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/lock`, { method: "POST" });
    setLocking(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Lock failed");
      return;
    }
    router.refresh();
  }

  if (locked) {
    return <p className="mt-3 text-body-sm text-(--color-text-secondary)">This period is locked — figures are final and immune to later rate changes.</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {dentists
          .filter((d) => d.payType === "PERCENTAGE_SPLIT")
          .map((d) => (
            <label key={d.id} className="flex items-center justify-between gap-2 rounded-(--radius-md) border border-(--color-border) p-2 text-body-sm">
              {d.name} — private revenue this period (£)
              <input
                type="number"
                step="0.01"
                className="w-28 rounded-(--radius-sm) border border-(--color-border) px-2 py-1 text-right"
                value={privateRevenue[d.id] ?? ""}
                onChange={(e) => setPrivateRevenue((s) => ({ ...s, [d.id]: e.target.value }))}
              />
            </label>
          ))}
      </div>
      {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}
      <div className="flex gap-3">
        <Button onClick={runCalculation} loading={running} disabled={locking}>
          Run calculation
        </Button>
        <Button variant="secondary" onClick={lock} loading={locking} disabled={running}>
          Lock period
        </Button>
      </div>
    </div>
  );
}
