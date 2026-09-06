"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, toast } from "@elio/ui";
import type { Dentist } from "@elio/db";
import { usePayPeriodActions } from "./pay-period-actions-provider";

/**
 * Runs the pay-engine for every dentist in the practice against this pay period.
 * Step 34 — disabled while Dentally fetch is in progress (canonical ops→calc order).
 * Step 32 — manual £ plugs require a note (no unexplained plugs).
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
  const { fetching } = usePayPeriodActions();
  const [privateRevenue, setPrivateRevenue] = React.useState<Record<string, string>>({});
  const [manualNote, setManualNote] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasManualPlugs = Object.values(privateRevenue).some((v) => v.trim() !== "" && Number(v) > 0);

  async function runCalculation() {
    if (hasManualPlugs && !manualNote.trim()) {
      const msg = "Add a note explaining manual private revenue plugs (Step 32)";
      setError(msg);
      toast.error(msg);
      return;
    }
    setRunning(true);
    setError(null);
    const note = manualNote.trim();
    const body = {
      dentists: dentists.map((d) => ({
        dentistId: d.id,
        ...(note ? { manualRevenueNote: note } : {}),
        privateRevenueItems: privateRevenue[d.id]
          ? [
              {
                amountPence: Math.round(Number(privateRevenue[d.id]) * 100),
                excludedAsConsultation: false,
                ...(note ? { manualNote: note } : {}),
              },
            ]
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
    return (
      <p className="text-body-sm text-(--color-text-secondary)">
        This period is locked — figures are final and immune to later rate changes.
      </p>
    );
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
                disabled={fetching || running}
                placeholder="Leave blank to use Dentally lines"
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-body-sm text-(--color-text-tertiary)">
          No percentage-split dentists — run calculation to generate hourly payslips.
        </p>
      )}
      {hasManualPlugs ? (
        <div>
          <Label htmlFor="manual-revenue-note">Manual plug note (required)</Label>
          <Input
            id="manual-revenue-note"
            className="mt-2"
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            disabled={fetching || running}
            placeholder="Why these amounts replace Dentally lines"
            data-testid="manual-revenue-note"
          />
        </div>
      ) : null}
      {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}
      {fetching ? (
        <p className="text-body-sm text-(--color-warning)">Wait for Dentally fetch to finish before calculating.</p>
      ) : null}
      <Button
        onClick={runCalculation}
        loading={running}
        disabled={fetching || running}
        data-testid="run-calculation"
      >
        Run calculation
      </Button>
    </div>
  );
}
