"use client";

import * as React from "react";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
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
import { FlowStatCard } from "@/components/flow-stat-card";
import type { FlowDashboardData, FlowDashboardRow } from "@/lib/flow-service";
import { DashboardCharts } from "./dashboard-charts";
import { DashboardEditDialog } from "./dashboard-edit-dialog";
import { DashboardPatientPanel } from "./dashboard-patient-panel";

const DATE_PRESETS = [
  { id: "all", label: "All time" },
  { id: "this-week", label: "This week" },
  { id: "last-week", label: "Last week" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "12m", label: "12 months" },
] as const;

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "stuck", label: "Stuck" },
  { id: "new", label: "New" },
  { id: "thinking", label: "Thinking" },
  { id: "failed-finance", label: "Failed Finance" },
  { id: "price-shopping", label: "Price Shopping" },
  { id: "bad-experience", label: "Bad Experience" },
  { id: "out-of-budget", label: "Out of Budget" },
  { id: "converted", label: "Converted" },
  { id: "completed", label: "Completed" },
] as const;

function presetRange(preset: string): { from?: string; to?: string } {
  if (preset === "all") return {};
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const monday = (d: Date) => {
    const x = new Date(d);
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  switch (preset) {
    case "this-week": {
      const s = monday(now);
      return { from: s.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    }
    case "last-week": {
      const s = monday(now);
      s.setDate(s.getDate() - 7);
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      e.setHours(23, 59, 59, 999);
      return { from: s.toISOString().slice(0, 10), to: e.toISOString().slice(0, 10) };
    }
    case "this-month": {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    }
    case "last-month": {
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    }
    case "3m":
      start.setMonth(start.getMonth() - 3);
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    case "6m":
      start.setMonth(start.getMonth() - 6);
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    case "12m":
      start.setMonth(start.getMonth() - 12);
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    default:
      return {};
  }
}

function ProgressDots({
  attended,
  hasPlan,
  hasDeposit,
  treatmentBooked,
}: {
  attended: boolean;
  hasPlan: boolean;
  hasDeposit: boolean;
  treatmentBooked: boolean;
}) {
  const steps = [attended, hasPlan, hasDeposit, treatmentBooked];
  return (
    <div className="flex gap-1" aria-label="Progress: attended, plan, deposit, treatment booked">
      {steps.map((on, i) => (
        <span
          key={i}
          className={`inline-block size-2.5 rounded-full ${on ? "bg-(--color-success)" : "bg-(--color-border)"}`}
        />
      ))}
    </div>
  );
}

function exportRowsCsv(rows: FlowDashboardRow[], planDisplayName: string, appDisplayName: string) {
  const headers = [
    "Name",
    "Phone",
    "Email",
    "Dentist",
    "Booked by",
    "Consultation Date",
    "Plan Value",
    "Paid",
    "Status",
    "Touchpoints",
    "Plan Signed Up",
    "Notes",
  ];
  const lines = rows.map((r) => [
    r.patientName,
    r.patientPhone ?? "",
    r.patientEmail ?? "",
    r.dentistName,
    r.bookedBy ?? "",
    r.consultationDate ?? "",
    (r.planValuePence / 100).toFixed(2),
    (r.totalPaidPence / 100).toFixed(2),
    r.statusLabel,
    String(r.touchPoints),
    r.planSignedUp ? "Yes" : "No",
    r.notes ?? "",
  ]);
  const csv = [headers, ...lines]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = (appDisplayName || "flow").toLowerCase().replace(/\s+/g, "-");
  a.download = `${slug}-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DashboardClient({ initial }: { initial: FlowDashboardData }) {
  const [data, setData] = React.useState(initial);
  const [preset, setPreset] = React.useState("all");
  const [dentistId, setDentistId] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [syncingPayments, setSyncingPayments] = React.useState(false);
  const [syncingFull, setSyncingFull] = React.useState(false);
  const [view, setView] = React.useState<"table" | "charts">("table");
  const [editRow, setEditRow] = React.useState<FlowDashboardRow | null>(null);
  const [detailRow, setDetailRow] = React.useState<FlowDashboardRow | null>(null);

  async function loadDashboard(nextPreset = preset, nextDentist = dentistId) {
    setLoading(true);
    try {
      const range = presetRange(nextPreset);
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      if (nextDentist !== "all") params.set("dentistId", nextDentist);
      const res = await fetch(`/flow/api/dashboard${params.toString() ? `?${params}` : ""}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to load");
      setData(await res.json());
    } catch (err) {
      toast.error("Couldn't refresh dashboard", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function importFromDentally() {
    setImporting(true);
    try {
      const res = await fetch("/flow/api/sync/consults", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      toast.success("Import complete", {
        description: `${body.created ?? 0} new, ${body.updated ?? 0} updated consult(s).`,
      });
      await loadDashboard();
    } catch (err) {
      toast.error("Dentally import failed", {
        description: err instanceof Error ? err.message : "Run Portal sync first if data is stale.",
      });
    } finally {
      setImporting(false);
    }
  }

  async function syncPaymentsFromDentally() {
    setSyncingPayments(true);
    try {
      const res = await fetch("/flow/api/sync/dentally", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "payments" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Payment sync failed");
      toast.success("Payment sync complete", {
        description: `Updated ${body.updated ?? 0} of ${body.total ?? 0} consult(s).`,
      });
      await loadDashboard();
    } catch (err) {
      toast.error("Payment sync failed", {
        description: err instanceof Error ? err.message : "Run Portal sync first if data is stale.",
      });
    } finally {
      setSyncingPayments(false);
    }
  }

  async function syncFullFromDentally() {
    setSyncingFull(true);
    try {
      const res = await fetch("/flow/api/sync/dentally", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 202) {
        toast.success("Full sync started", {
          description: body.message ?? "Check Portal Integrations for progress.",
        });
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Full sync failed");
      toast.success("Full sync started");
    } catch (err) {
      toast.error("Full sync failed", {
        description: err instanceof Error ? err.message : "Check Portal Integrations settings.",
      });
    } finally {
      setSyncingFull(false);
    }
  }

  const filteredRows = data.rows.filter((row) => {
    if (statusFilter === "stuck") {
      if (row.statusKey !== "stuck" && !["thinking", "failed-finance", "price-shopping", "bad-experience", "out-of-budget"].includes(row.statusKey)) {
        return false;
      }
    } else if (statusFilter !== "all" && row.statusKey !== statusFilter) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = [row.patientName, row.patientEmail, row.patientPhone].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: data.rows.length };
    for (const row of data.rows) {
      counts[row.statusKey] = (counts[row.statusKey] ?? 0) + 1;
      if (["stuck", "thinking", "failed-finance", "price-shopping", "bad-experience", "out-of-budget"].includes(row.statusKey)) {
        counts.stuck = (counts.stuck ?? 0) + 1;
      }
    }
    return counts;
  }, [data.rows]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-3 rounded-(--radius-lg) border border-(--color-border) p-4">
        <div>
          <Label htmlFor="date-preset">Period</Label>
          <select
            id="date-preset"
            className="mt-1 block h-10 rounded-(--radius-md) border border-(--color-border) bg-(--color-bg) px-3 text-body-sm"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              void loadDashboard(e.target.value, dentistId);
            }}
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="dentist-filter">Dentist</Label>
          {data.practitionerScope.viewAll ? (
          <select
            id="dentist-filter"
            data-testid="dentist-filter"
            className="mt-1 block h-10 rounded-(--radius-md) border border-(--color-border) bg-(--color-bg) px-3 text-body-sm"
            value={dentistId}
            onChange={(e) => {
              setDentistId(e.target.value);
              void loadDashboard(preset, e.target.value);
            }}
          >
            <option value="all">All dentists</option>
            {data.dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          ) : (
            <p className="mt-1 text-body-sm text-(--color-text-secondary)" data-testid="dentist-scope-locked">
              {data.dentists[0]?.name ?? "Your patients only"}
            </p>
          )}
        </div>
        <Button variant="secondary" loading={loading} onClick={() => loadDashboard()}>
          Refresh
        </Button>
        <Button loading={importing} onClick={importFromDentally} data-testid="flow-import-consults">
          Import from Dentally
        </Button>
        <Button variant="secondary" loading={syncingPayments} onClick={syncPaymentsFromDentally} data-testid="flow-sync-payments">
          Sync payments
        </Button>
        <Button variant="secondary" loading={syncingFull} onClick={syncFullFromDentally} data-testid="flow-sync-full">
          Full sync
        </Button>
        <a
          href="/settings/integrations"
          className="text-body-sm font-medium text-(--color-brand) underline underline-offset-2"
        >
          Sync status (Portal)
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <FlowStatCard label="Consultations" value={data.stats.totalConsultations} />
        <FlowStatCard label="Attended" value={data.stats.attended} />
        <FlowStatCard label="Converted" value={data.stats.converted} />
        <FlowStatCard label="Stuck" value={data.stats.stuck} />
        <FlowStatCard label="Total planned" value={data.stats.totalPlannedPence} money />
        <FlowStatCard label="Total paid" value={data.stats.totalPaidPence} money />
        <FlowStatCard label={`${data.planDisplayName} sign-ups`} value={data.stats.planSignUps} />
        <FlowStatCard label="Conversion" value={data.stats.conversionRate} suffix="%" />
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setView("table")}
              className={`rounded-(--radius-md) px-3 py-1.5 text-body-sm font-medium ${
                view === "table"
                  ? "bg-(--color-primary) text-(--color-primary-fg)"
                  : "bg-(--color-bg-subtle) text-(--color-text-secondary)"
              }`}
            >
              Table
            </button>
            <button
              type="button"
              onClick={() => setView("charts")}
              className={`rounded-(--radius-md) px-3 py-1.5 text-body-sm font-medium ${
                view === "charts"
                  ? "bg-(--color-primary) text-(--color-primary-fg)"
                  : "bg-(--color-bg-subtle) text-(--color-text-secondary)"
              }`}
            >
              Charts
            </button>
          </div>
          {view === "table" ? (
            <Button variant="secondary" onClick={() => exportRowsCsv(filteredRows, data.planDisplayName, data.appDisplayName)} data-testid="flow-export-csv">
              Export CSV
            </Button>
          ) : null}
        </div>

        {view === "charts" ? (
          <DashboardCharts rows={data.rows} stats={data.stats} />
        ) : (
          <>
        <div className="mb-3 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-full px-3 py-1 text-caption font-medium transition-colors ${
                statusFilter === f.id
                  ? "bg-(--color-primary) text-(--color-primary-fg)"
                  : "bg-(--color-bg-subtle) text-(--color-text-secondary) hover:text-(--color-text-primary)"
              }`}
            >
              {f.label}
              {statusCounts[f.id] != null ? ` (${statusCounts[f.id]})` : ""}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <Label htmlFor="patient-search" className="sr-only">
            Search patients
          </Label>
          <Input
            id="patient-search"
            placeholder="Search name, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <TablePanel>
          {filteredRows.length === 0 ? (
            <EmptyState
              title="No patients in this view"
              description="Import cosmetic consults from Dentally or adjust your filters."
              className="py-12"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Dentist</TableHead>
                    <TableHead>Booked by</TableHead>
                    <TableHead>Touchpoints</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Consult date</TableHead>
                    <TableHead className="text-right">Plan value</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setDetailRow(row)}
                          className="text-left font-medium text-(--color-brand) underline-offset-2 hover:underline"
                        >
                          {row.patientName}
                        </button>
                        {row.patientPhone ? (
                          <div className="text-caption text-(--color-text-tertiary)">{row.patientPhone}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.dentistName}</TableCell>
                      <TableCell>{row.bookedBy ?? "—"}</TableCell>
                      <TableCell>{row.touchPoints}</TableCell>
                      <TableCell>{row.planSignedUp ? <Badge variant="success">Signed up</Badge> : "—"}</TableCell>
                      <TableCell>{row.consultationDate ?? "—"}</TableCell>
                      <TableCellMoney>{formatMoneyGBPOrDash(row.planValuePence)}</TableCellMoney>
                      <TableCellMoney>{formatMoneyGBPOrDash(row.totalPaidPence)}</TableCellMoney>
                      <TableCell>
                        <ProgressDots
                          attended={row.attended}
                          hasPlan={row.hasPlan}
                          hasDeposit={row.hasDeposit}
                          treatmentBooked={row.treatmentBooked}
                        />
                      </TableCell>
                      <TableCellMoney>{row.daysSinceConsult}</TableCellMoney>
                      <TableCell>
                        <Badge variant={row.statusKey === "converted" || row.statusKey === "completed" ? "success" : "neutral"}>
                          {row.statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setEditRow(row)}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TablePanel>
          </>
        )}
      </div>

      <DashboardEditDialog
        row={editRow}
        dentists={data.dentists}
        open={editRow !== null}
        onOpenChange={(open) => {
          if (!open) setEditRow(null);
        }}
        onSaved={() => void loadDashboard()}
      />

      <DashboardPatientPanel
        row={detailRow}
        open={detailRow !== null}
        onOpenChange={(open) => {
          if (!open) setDetailRow(null);
        }}
        onEdit={(row) => setEditRow(row)}
      />
    </div>
  );
}
