"use client";

import * as React from "react";
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  EmptyState,
} from "@elio/ui";

interface ReconMismatch {
  type: "MISSING" | "DUPLICATE" | "AMOUNT" | "STATUS" | "UNEXPECTED";
  patientPlanEnrolmentId: string | null;
  billingPeriod: string | null;
  gocardlessPaymentId?: string | null;
  detail: string;
}

interface ReconResult {
  period: string;
  chargeWindow: { from: string; to: string };
  counts: { expected: number; localPayments: number; gocardlessPayments: number; mismatches: number };
  mismatches: ReconMismatch[];
}

const TYPE_VARIANT: Record<ReconMismatch["type"], "success" | "warning" | "danger" | "neutral" | "info"> = {
  MISSING: "danger",
  DUPLICATE: "warning",
  AMOUNT: "warning",
  STATUS: "info",
  UNEXPECTED: "danger",
};

export function ReconciliationRunner({ defaultPeriod }: { defaultPeriod: string }) {
  const [period, setPeriod] = React.useState(defaultPeriod);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ReconResult | null>(null);

  async function runReconciliation() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/plans/api/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Reconciliation failed");
        return;
      }
      setResult(data as ReconResult);
    } catch {
      setError("Reconciliation failed — network error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Run reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label htmlFor="period">Billing period</Label>
              <Input
                id="period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="YYYY-MM"
                className="w-40"
              />
            </div>
            {error && <p className="text-body-sm text-(--color-danger)">{error}</p>}
            <Button onClick={runReconciliation} loading={running} disabled={!/^\d{4}-\d{2}$/.test(period)}>
              Run reconciliation
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-body-sm text-(--color-text-secondary)">Expected charges</p>
              <p className="mt-1 text-h3 tabular-nums text-(--color-text-primary)">{result.counts.expected}</p>
            </Card>
            <Card className="p-4">
              <p className="text-body-sm text-(--color-text-secondary)">Local payments</p>
              <p className="mt-1 text-h3 tabular-nums text-(--color-text-primary)">{result.counts.localPayments}</p>
            </Card>
            <Card className="p-4">
              <p className="text-body-sm text-(--color-text-secondary)">GoCardless payments</p>
              <p className="mt-1 text-h3 tabular-nums text-(--color-text-primary)">{result.counts.gocardlessPayments}</p>
            </Card>
            <Card className="p-4" accentColor={result.counts.mismatches > 0 ? "var(--color-danger)" : undefined}>
              <p className="text-body-sm text-(--color-text-secondary)">Mismatches</p>
              <p className="mt-1 text-h3 tabular-nums text-(--color-text-primary)">{result.counts.mismatches}</p>
            </Card>
          </div>

          <p className="text-body-sm text-(--color-text-tertiary)">
            Charge window: {result.chargeWindow.from} to {result.chargeWindow.to}
          </p>

          {result.mismatches.length === 0 ? (
            <div className="rounded-(--radius-lg) border border-(--color-border)">
              <EmptyState
                title="No mismatches"
                description={`${result.period} reconciles cleanly — every expected charge matches GoCardless.`}
              />
            </div>
          ) : (
            <div className="rounded-(--radius-lg) border border-(--color-border)">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Enrolment</TableHead>
                    <TableHead>GoCardless payment</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.mismatches.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant={TYPE_VARIANT[m.type]}>{m.type}</Badge>
                      </TableCell>
                      <TableCell className="font-(--font-mono) text-body-sm">
                        {m.patientPlanEnrolmentId ?? "—"}
                      </TableCell>
                      <TableCell className="font-(--font-mono) text-body-sm">
                        {m.gocardlessPaymentId ?? "—"}
                      </TableCell>
                      <TableCell className="text-body-sm">{m.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
