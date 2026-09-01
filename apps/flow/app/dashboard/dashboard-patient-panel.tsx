"use client";

import * as React from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableCellMoney,
  TableHead,
  TableHeader,
  TablePanel,
  TableRow,
  formatMoneyGBPOrDash,
  toast,
} from "@elio/ui";
import type { FlowDashboardRow } from "@/lib/flow-service";

type LivePanel = {
  patient: {
    name: string;
    email: string | null;
    phone: string | null;
    dentallyId: string;
  };
  account: {
    currentBalancePence: number;
    plannedPrivateTreatmentValuePence: number | null;
  } | null;
  appointments: Array<{
    id: string;
    startsAt: string | null;
    reason: string | null;
    state: string | null;
  }>;
  invoices: Array<{
    id: string;
    datedOn: string | null;
    amountPence: number;
    amountOutstandingPence: number;
    paid: boolean;
    state: string | null;
  }>;
  payments: Array<{
    id: string;
    paidAt: string | null;
    amountPence: number;
  }>;
  fetchedAt: string;
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function DashboardPatientPanel({
  row,
  open,
  onOpenChange,
  onEdit,
}: {
  row: FlowDashboardRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (row: FlowDashboardRow) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [panel, setPanel] = React.useState<LivePanel | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (!open || !row?.patientId) {
      setPanel(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetch(`/flow/api/patients/${row.patientId}/live`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load patient");
        return res.json() as Promise<LivePanel>;
      })
      .then((data) => {
        if (!cancelled) setPanel(data);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error("Couldn't load patient from Dentally", {
            description: err instanceof Error ? err.message : "Please try again.",
          });
          onOpenChange(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, row?.patientId, reloadKey, onOpenChange]);

  const title = row?.patientName ?? "Patient";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed right-0 top-0 left-auto flex h-full w-full max-w-lg translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-l border-(--color-border-subtle) p-0 shadow-(--shadow-lg)">
        <div className="border-b border-(--color-border-subtle) p-6 pb-4">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-8">
              <div>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>
                  {row?.patientId
                    ? "Live Dentally records for this pipeline patient."
                    : "This lead has no linked Dentally patient yet."}
                </DialogDescription>
              </div>
              {row && onEdit ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onOpenChange(false);
                    onEdit(row);
                  }}
                >
                  Edit
                </Button>
              ) : null}
            </div>
          </DialogHeader>

          {row ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="neutral">{row.statusLabel}</Badge>
              <Badge variant="neutral">Consult {row.consultationDate ?? "—"}</Badge>
              <Badge variant="neutral">Plan {formatMoneyGBPOrDash(row.planValuePence)}</Badge>
              <Badge variant="neutral">Paid {formatMoneyGBPOrDash(row.totalPaidPence)}</Badge>
            </div>
          ) : null}

          {row?.notes ? (
            <p className="mt-3 rounded-(--radius-md) bg-(--color-bg-subtle) p-3 text-body-sm text-(--color-text-secondary)">
              {row.notes}
            </p>
          ) : null}

          {panel ? (
            <div className="mt-3 space-y-1 text-body-sm text-(--color-text-secondary)">
              {panel.patient.phone ? <p>{panel.patient.phone}</p> : null}
              {panel.patient.email ? <p>{panel.patient.email}</p> : null}
              {panel.account?.plannedPrivateTreatmentValuePence != null ? (
                <p>
                  Planned treatment (live): {formatMoneyGBPOrDash(panel.account.plannedPrivateTreatmentValuePence)}
                </p>
              ) : null}
              <p className="text-caption text-(--color-text-tertiary)">
                Dentally #{panel.patient.dentallyId} · fetched {formatWhen(panel.fetchedAt)}
              </p>
            </div>
          ) : null}

          {row?.patientId ? (
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              loading={loading}
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Refresh from Dentally
            </Button>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4">
          {!row?.patientId ? (
            <p className="text-body-sm text-(--color-text-tertiary)">
              Link this enquiry to a Dentally patient before viewing live records.
            </p>
          ) : loading && !panel ? (
            <p className="text-body-sm text-(--color-text-tertiary)">Loading from Dentally…</p>
          ) : panel ? (
            <div className="flex flex-col gap-6">
              <section>
                <h3 className="mb-2 text-body-sm font-semibold text-(--color-text-primary)">Appointments</h3>
                {panel.appointments.length === 0 ? (
                  <p className="text-body-sm text-(--color-text-tertiary)">No appointments found.</p>
                ) : (
                  <TablePanel>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>State</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {panel.appointments.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="text-body-sm">{formatWhen(a.startsAt)}</TableCell>
                            <TableCell className="text-body-sm text-(--color-text-secondary)">{a.reason ?? "—"}</TableCell>
                            <TableCell className="text-body-sm">
                              {a.state ? <Badge variant="neutral">{a.state}</Badge> : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TablePanel>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-body-sm font-semibold text-(--color-text-primary)">Invoices</h3>
                {panel.invoices.length === 0 ? (
                  <p className="text-body-sm text-(--color-text-tertiary)">No invoices found.</p>
                ) : (
                  <TablePanel>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {panel.invoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="text-body-sm">{inv.datedOn ?? "—"}</TableCell>
                            <TableCellMoney>{formatMoneyGBPOrDash(inv.amountPence)}</TableCellMoney>
                            <TableCellMoney>{formatMoneyGBPOrDash(inv.amountOutstandingPence)}</TableCellMoney>
                            <TableCell className="text-body-sm">
                              <Badge variant={inv.paid ? "success" : "neutral"}>{inv.paid ? "Paid" : inv.state ?? "Open"}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TablePanel>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-body-sm font-semibold text-(--color-text-primary)">Payments</h3>
                {panel.payments.length === 0 ? (
                  <p className="text-body-sm text-(--color-text-tertiary)">No payments found.</p>
                ) : (
                  <TablePanel>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {panel.payments.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-body-sm">{formatWhen(p.paidAt)}</TableCell>
                            <TableCellMoney>{formatMoneyGBPOrDash(p.amountPence)}</TableCellMoney>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TablePanel>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
