"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, toast } from "@elio/ui";
import type { Dentist } from "@elio/db";

/**
 * Runs the pay-engine for every dentist in the practice against this pay period, then
 * (once payslips exist) offers to lock it. Manual £ entry is optional when Dentally fetch
 * has populated PrivateRevenueLineItem rows — leave blank and run calculation to use fetched data.
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
      const msg = data.error ?? "Calculation failed";
      setError(msg);
      toast.error(msg);
      return;
    }
    toast.success("Calculation complete");
    router.refresh();
  }

  if (locked) {
    return <p className="text-body-sm text-(--color-text-secondary)">This period is locked — figures are final and immune to later rate changes.</p>;
  }

  const splitDentists = dentists.filter((d) => d.payType === "PERCENTAGE_SPLIT");

  return (
    <div className="space-y-4">
      {splitDentists.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {splitDentists.map((d) => (
            <div key={d.id} className="rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-3">
              <Label htmlFor={`private-${d.id}`}>{d.name} — private revenue (£)</Label>
              <Input
                id={`private-${d.id}`}
                type="number"
                step="0.01"
                min="0"
                className="mt-2 text-right"
                value={privateRevenue[d.id] ?? ""}
                onChange={(e) => setPrivateRevenue((s) => ({ ...s, [d.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-body-sm text-(--color-text-tertiary)">No percentage-split dentists — run calculation to generate hourly payslips.</p>
      )}
      {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}
      <Button onClick={runCalculation} loading={running}>
        Run calculation
      </Button>
    </div>
  );
}
