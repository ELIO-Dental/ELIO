"use client";

import * as React from "react";
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  TablePagination,
  TableRow,
  formatMoneyGBPOrDash,
  toast,
  useClientTablePagination,
} from "@elio/ui";
import { FlowStatCard } from "@/components/flow-stat-card";
import { flowDatePresetRange } from "@/lib/flow-date-range";
import type { FlowDashboardData, FlowDashboardRow } from "@/lib/flow-service";
import { DashboardCharts } from "./dashboard-charts";
import { DashboardEditDialog } from "./dashboard-edit-dialog";
import { DashboardPatientPanel } from "./dashboard-patient-panel";

const DATE_PRESETS = [
  { id: "3m", label: "Last 3 months" },
  { id: "this-week", label: "This week" },
  { id: "last-week", label: "Last week" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "6m", label: "Last 6 months" },
  { id: "12m", label: "Last 12 months" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom range" },
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

type SortField =
  | "patient"
  | "dentist"
  | "date"
  | "value"
  | "paid"
  | "days"
  | "status"
  | "touchpoints";
type SortDirection = "asc" | "desc";

type SyncLogLine = { message: string; at: string };

function appointmentStateClass(attended: boolean, state: string | null) {
  if (attended) return "text-(--color-success)";
  if (state === "DNA" || state === "Did Not Attend") return "text-red-600";
  if (state === "Cancelled") return "text-orange-500";
  if (state === "Confirmed") return "text-blue-600";
  return "text-(--color-text-tertiary)";
}

function appointmentStateLabel(attended: boolean, state: string | null) {
  if (attended) return "Attended";
  return state || "Pending";
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
  const steps = [
    { on: attended, title: "Consultation attended" },
    { on: hasPlan, title: "Has active plan" },
    { on: hasDeposit, title: "Deposit paid" },
    { on: treatmentBooked, title: "Treatment booked" },
  ];
  return (
    <div className="flex gap-1" aria-label="Progress: attended, plan, deposit, treatment booked">
      {steps.map((step, i) => (
        <span
          key={i}
          title={step.title}
          className={`inline-block size-2.5 rounded-full ${step.on ? "bg-(--color-success)" : "bg-(--color-border)"}`}
        />
      ))}
    </div>
  );
}

/** Legacy Stuck filter: attended and not converted (includes thinking + named stuck reasons). */
function isStuckRow(row: FlowDashboardRow) {
  return row.attended === true && row.statusKey !== "converted" && row.statusKey !== "completed";
}

function exportRowsCsv(rows: FlowDashboardRow[], planDisplayName: string, appDisplayName: string) {
  const planHeader = planDisplayName?.trim() ? `${planDisplayName} Signed Up` : "Plan Signed Up";
  const headers = [
    "Name",
    "Phone",
    "Email",
    "Dentist",
    "Booked by",
    "Consultation Date",
    "Appointment State",
    "Plan Value",
    "Paid",
    "Status",
    "Touchpoints",
    planHeader,
    "Notes",
  ];
  const lines = rows.map((r) => [
    r.patientName,
    r.patientPhone ?? "",
    r.patientEmail ?? "",
    r.dentistName,
    r.bookedBy ?? "",
    r.consultationDate ?? "",
    appointmentStateLabel(r.attended, r.appointmentState),
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
  // All time = classic sheet totals for Total Planned / Total Paid.
  // Match classic ElioFlow home: Last 3 Months (All time still available).
  const [preset, setPreset] = React.useState("3m");
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");
  const [dentistId, setDentistId] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [sortField, setSortField] = React.useState<SortField>("days");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [loading, setLoading] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [syncingPayments, setSyncingPayments] = React.useState(false);
  const [syncingFull, setSyncingFull] = React.useState(false);
  const [view, setView] = React.useState<"table" | "charts">("table");
  const [editRow, setEditRow] = React.useState<FlowDashboardRow | null>(null);
  const [detailRow, setDetailRow] = React.useState<FlowDashboardRow | null>(null);
  const [syncLogOpen, setSyncLogOpen] = React.useState(false);
  const [syncLog, setSyncLog] = React.useState<SyncLogLine[]>([]);

  React.useEffect(() => {
    setData(initial);
  }, [initial]);

  function appendSyncLog(message: string) {
    setSyncLog((prev) => [...prev, { message, at: new Date().toISOString() }]);
    setSyncLogOpen(true);
  }

  async function loadDashboard(
    nextPreset = preset,
    nextDentist = dentistId,
    nextFrom = customFrom,
    nextTo = customTo,
  ) {
    if (nextPreset === "custom" && (!nextFrom || !nextTo)) return;
    setLoading(true);
    try {
      const range =
        nextPreset === "custom" ? { from: nextFrom, to: nextTo } : flowDatePresetRange(nextPreset);
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      if (nextDentist !== "all") params.set("dentistId", nextDentist);
      // Bust any intermediary cache — KPIs must match live Neon.
      params.set("_", String(Date.now()));
      const res = await fetch(`/flow/api/dashboard?${params.toString()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
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
    appendSyncLog("Import from Dentally started…");
    try {
      const res = await fetch("/flow/api/sync/consults", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      const summary = `${body.created ?? 0} new, ${body.updated ?? 0} updated consult(s).`;
      appendSyncLog(body.message ? String(body.message) : `Import complete — ${summary}`);
      toast.success("Import complete", { description: summary });
      await loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Run Portal sync first if data is stale.";
      appendSyncLog(`Import failed: ${msg}`);
      toast.error("Dentally import failed", { description: msg });
    } finally {
      setImporting(false);
    }
  }

  async function syncPaymentsFromDentally() {
    setSyncingPayments(true);
    appendSyncLog("Payment sync started…");
    try {
      // Re-derives from already-synced Postgres rows (no Dentally API calls), so this
      // is synchronous now and returns the real result directly — previously it was
      // backgrounded and the real {total, updated, errors} counts went only to the
      // audit log, never to the user, so per-consult failures were invisible.
      const res = await fetch("/flow/api/sync/dentally", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "payments" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Payment sync failed");
      const errors = Number(body.errors ?? 0);
      appendSyncLog(body.message ?? `Payment sync complete — updated ${body.updated ?? 0} of ${body.total ?? 0}.`);
      if (errors > 0) {
        toast.warning("Payment sync completed with errors", {
          description: `Updated ${body.updated ?? 0} of ${body.total ?? 0} consult(s) — ${errors} failed. See server logs for details.`,
        });
      } else {
        toast.success("Payment sync complete", {
          description: `Updated ${body.updated ?? 0} of ${body.total ?? 0} consult(s).`,
        });
      }
      await loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Run Portal sync first if data is stale.";
      appendSyncLog(`Payment sync failed: ${msg}`);
      toast.error("Payment sync failed", { description: msg });
    } finally {
      setSyncingPayments(false);
    }
  }

  /** Polls the real DentallySyncRun status to actual completion instead of guessing
   *  with a fixed timeout. Previously the dashboard refreshed once at +8s regardless
   *  of whether the background job (which can legitimately take much longer) had
   *  finished — a slower/larger sync would leave the table silently showing
   *  pre-sync data with no further signal. Also: the automatic cosmetic-consult
   *  import (registered in instrumentation.ts) only runs once this status flips to
   *  SUCCESS/PARTIAL/FAILED, so polling here is what lets the log correctly report
   *  when the REAL data (not a stale manual re-scan) has actually landed. */
  async function pollFullSyncToCompletion() {
    const deadlineMs = Date.now() + 15 * 60 * 1000; // full sync can legitimately run long
    let lastPhase: string | null = null;
    while (Date.now() < deadlineMs) {
      await new Promise((r) => setTimeout(r, 3000));
      let statusData: { latestRun: { status: string; currentPhase: string | null; errorMessage: string | null } | null };
      try {
        const statusRes = await fetch("/flow/api/sync/dentally/status");
        if (!statusRes.ok) continue; // transient — keep polling rather than giving up
        statusData = await statusRes.json();
      } catch {
        continue; // network blip — keep polling rather than giving up
      }
      const run = statusData.latestRun;
      if (!run) continue;
      if (run.currentPhase && run.currentPhase !== lastPhase) {
        lastPhase = run.currentPhase;
        appendSyncLog(`Syncing ${run.currentPhase.replace(/_/g, " ")}…`);
      }
      if (run.status === "SUCCESS" || run.status === "PARTIAL") {
        appendSyncLog(
          run.status === "PARTIAL"
            ? "Full sync finished with some record errors — cosmetic consult import has run automatically."
            : "Full sync complete — cosmetic consult import has run automatically."
        );
        return true;
      }
      if (run.status === "FAILED") {
        appendSyncLog(`Full sync failed: ${run.errorMessage ?? "unknown error"}`);
        toast.error("Full sync failed", { description: run.errorMessage ?? undefined });
        return false;
      }
    }
    appendSyncLog("Still syncing — this is taking a while. Check Portal Integrations for live progress.");
    return false;
  }

  async function syncFullFromDentally() {
    setSyncingFull(true);
    appendSyncLog("Full Dentally sync started…");
    try {
      const res = await fetch("/flow/api/sync/dentally", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 202) {
        toast.success("Full sync started", {
          description: body.message ?? "Background Dentally pull started — the log below will show live progress.",
        });
        await loadDashboard();
        const finished = await pollFullSyncToCompletion();
        await loadDashboard();
        if (finished) toast.success("Full sync complete — dashboard refreshed with the latest data");
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Full sync failed");
      appendSyncLog(body.message ?? "Full sync started.");
      toast.success("Full sync started");
      await loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Check Portal Integrations settings.";
      appendSyncLog(`Full sync failed: ${msg}`);
      toast.error("Full sync failed", { description: msg });
    } finally {
      setSyncingFull(false);
    }
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  }

  const sortedRows = React.useMemo(() => {
    const filtered = data.rows.filter((row) => {
      if (statusFilter === "stuck") {
        if (!isStuckRow(row)) return false;
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

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "patient":
          comparison = a.patientName.localeCompare(b.patientName);
          break;
        case "dentist":
          comparison = a.dentistName.localeCompare(b.dentistName);
          break;
        case "date":
          comparison = (a.consultationDate ?? "").localeCompare(b.consultationDate ?? "");
          break;
        case "value":
          comparison = a.planValuePence - b.planValuePence;
          break;
        case "paid":
          comparison = a.totalPaidPence - b.totalPaidPence;
          break;
        case "days":
          comparison = a.daysSinceConsult - b.daysSinceConsult;
          break;
        case "status":
          comparison = a.statusLabel.localeCompare(b.statusLabel);
          break;
        case "touchpoints":
          comparison = a.touchPoints - b.touchPoints;
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [data.rows, statusFilter, search, sortField, sortDirection]);

  const tablePagination = useClientTablePagination(sortedRows, 50, [
    statusFilter,
    search,
    preset,
    dentistId,
    sortField,
    sortDirection,
  ]);

  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: data.rows.length, stuck: 0 };
    for (const row of data.rows) {
      counts[row.statusKey] = (counts[row.statusKey] ?? 0) + 1;
      if (isStuckRow(row)) counts.stuck = (counts.stuck ?? 0) + 1;
    }
    return counts;
  }, [data.rows]);

  function SortableHead({
    field,
    children,
    className,
  }: {
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }) {
    const active = sortField === field;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => handleSort(field)}
          className="inline-flex items-center gap-1 select-none hover:text-(--color-text-primary)"
        >
          <span>{children}</span>
          <span className="text-(--color-text-tertiary)" aria-hidden>
            {active ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </button>
      </TableHead>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-wrap items-end gap-3 rounded-(--radius-xl) border border-(--color-border-subtle) bg-(--color-surface) p-3.5 shadow-(--shadow-xs) sm:gap-4 sm:p-5">
        <div className="min-w-[9.5rem] flex-1 sm:flex-none">
          <Label htmlFor="date-preset">Period</Label>
          <select
            id="date-preset"
            className="mt-1 block h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-bg) px-3 text-body-sm"
            value={preset}
            onChange={(e) => {
              const next = e.target.value;
              setPreset(next);
              if (next !== "custom") void loadDashboard(next, dentistId);
            }}
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {preset === "custom" ? (
          <>
            <div>
              <Label htmlFor="custom-from">From</Label>
              <Input
                id="custom-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="custom-to">To</Label>
              <Input
                id="custom-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
            <Button
              loading={loading}
              disabled={!customFrom || !customTo}
              onClick={() => loadDashboard("custom", dentistId, customFrom, customTo)}
            >
              Apply
            </Button>
          </>
        ) : null}
        <div className="min-w-[9.5rem] flex-1 sm:flex-none">
          <Label htmlFor="dentist-filter">Dentist</Label>
          {data.practitionerScope.viewAll ? (
          <select
            id="dentist-filter"
            data-testid="dentist-filter"
            className="mt-1 block h-10 w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-bg) px-3 text-body-sm"
            value={dentistId}
            onChange={(e) => {
              setDentistId(e.target.value);
              if (preset === "custom" && (!customFrom || !customTo)) return;
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
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button variant="secondary" loading={loading} onClick={() => loadDashboard()} data-testid="flow-refresh">
            Refresh
          </Button>
          <Button
            loading={syncingFull}
            onClick={() => void syncFullFromDentally()}
            title="Pulls fresh data from Dentally in the background — the log below shows live progress, and cosmetic consults import automatically once it finishes."
            data-testid="flow-sync-dentally"
          >
            Sync Dentally
          </Button>
          <Button
            variant="secondary"
            loading={importing || syncingPayments}
            onClick={async () => {
              // Previously chained silently after "Sync Dentally," running against
              // whatever was in Postgres BEFORE that background pull landed — the
              // toast claimed counts as if reflecting the sync just triggered, while
              // the real import (via the automatic post-sync hook) happened later
              // with zero UI feedback. Split out as its own explicit action: re-scan
              // already-synced data now, without waiting for or triggering a new pull.
              await importFromDentally();
              await syncPaymentsFromDentally();
            }}
            title="Re-scans already-synced appointments/payments for new consults and updated financials — does not pull fresh data from Dentally."
            data-testid="flow-refresh-consults-payments"
          >
            Refresh consults &amp; payments
          </Button>
          <a
            href="/settings/integrations"
            className="inline-flex h-10 items-center text-body-sm font-medium text-(--color-primary-fg) hover:text-(--color-primary-fg-muted)"
          >
            Portal Integrations
          </a>
        </div>
        {data.lastSyncedAt ? (
          <p className="w-full text-caption text-(--color-text-tertiary)" data-testid="flow-last-synced">
            Last sync: {new Date(data.lastSyncedAt).toLocaleString("en-GB")}
            {preset !== "all" ? " · Totals are for the selected period" : " · Showing all-time totals"}
          </p>
        ) : (
          <p className="w-full text-caption text-(--color-text-tertiary)" data-testid="flow-last-synced">
            Last sync: never
          </p>
        )}
      </div>

      <div
        className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4 xl:grid-cols-8"
        data-testid="flow-stat-cards"
      >
        <FlowStatCard label="Consultations" value={data.stats.totalConsultations} />
        <FlowStatCard label="Attended" value={data.stats.attended} />
        <FlowStatCard label="Converted" value={data.stats.converted} tone="success" />
        <FlowStatCard label="Stuck" value={data.stats.stuck} tone="warning" />
        <FlowStatCard label="Total Planned" value={data.stats.totalPlannedPence} money />
        <FlowStatCard label="Total Paid" value={data.stats.totalPaidPence} money tone="success" />
        <FlowStatCard label={data.planDisplayName} value={data.stats.planSignUps} tone="accent" />
        <FlowStatCard label="Conversion" value={data.stats.conversionRate} suffix="%" />
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-1 shadow-(--shadow-xs)">
            <button
              type="button"
              onClick={() => setView("table")}
              className={`rounded-(--radius-md) px-3.5 py-1.5 text-body-sm font-medium transition-colors ${
                view === "table"
                  ? "bg-(--color-primary-button-bg) text-(--color-primary-button-fg) shadow-(--shadow-xs)"
                  : "text-(--color-text-secondary) hover:text-(--color-text-primary)"
              }`}
            >
              Table
            </button>
            <button
              type="button"
              onClick={() => setView("charts")}
              className={`rounded-(--radius-md) px-3.5 py-1.5 text-body-sm font-medium transition-colors ${
                view === "charts"
                  ? "bg-(--color-primary-button-bg) text-(--color-primary-button-fg) shadow-(--shadow-xs)"
                  : "text-(--color-text-secondary) hover:text-(--color-text-primary)"
              }`}
            >
              Charts
            </button>
          </div>
          {view === "table" ? (
            <Button variant="secondary" onClick={() => exportRowsCsv(sortedRows, data.planDisplayName, data.appDisplayName)} data-testid="flow-export-csv">
              Export CSV
            </Button>
          ) : null}
        </div>

        {view === "charts" ? (
          <DashboardCharts rows={data.rows} stats={data.stats} />
        ) : (
          <>
        <div className="mb-3 flex flex-wrap gap-1.5 sm:gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-(--radius-md) px-2.5 py-1 text-caption font-medium transition-colors sm:px-3 ${
                statusFilter === f.id
                  ? "bg-(--color-primary-button-bg) text-(--color-primary-button-fg)"
                  : "border border-(--color-border-subtle) bg-(--color-surface) text-(--color-text-secondary) hover:border-(--color-border) hover:text-(--color-text-primary)"
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

        <TablePanel
          footer={
            tablePagination.showPagination ? (
              <TablePagination
                page={tablePagination.page}
                pageSize={tablePagination.pageSize}
                totalCount={tablePagination.totalCount}
                onPageChange={tablePagination.setPage}
              />
            ) : undefined
          }
        >
          {sortedRows.length === 0 ? (
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
                    <SortableHead field="patient">Patient</SortableHead>
                    <SortableHead field="dentist">Dentist</SortableHead>
                    <TableHead>Booked by</TableHead>
                    <SortableHead field="touchpoints">Touchpoints</SortableHead>
                    <TableHead>Plan</TableHead>
                    <SortableHead field="date">Consult date</SortableHead>
                    <SortableHead field="value" className="text-right">
                      Plan value
                    </SortableHead>
                    <SortableHead field="paid" className="text-right">
                      Paid
                    </SortableHead>
                    <TableHead>Progress</TableHead>
                    <SortableHead field="days" className="text-right">
                      Days
                    </SortableHead>
                    <SortableHead field="status">Status</SortableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tablePagination.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setEditRow(row)}
                          className="text-left font-medium text-(--color-brand) underline-offset-2 hover:underline"
                        >
                          {row.patientName}
                        </button>
                        {(row.patientPhone || row.patientEmail) ? (
                          <div className="text-caption text-(--color-text-tertiary)">
                            {row.patientPhone || row.patientEmail}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.dentistName}</TableCell>
                      <TableCell>{row.bookedBy ?? "—"}</TableCell>
                      <TableCell>{row.touchPoints}</TableCell>
                      <TableCell>
                        {row.planSignedUp ? (
                          <Badge variant="success" title={`${data.planDisplayName} signed up`}>
                            {data.planDisplayName.length <= 12
                              ? data.planDisplayName
                              : data.planDisplayName.slice(0, 2).toUpperCase()}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div>{row.consultationDate ?? "—"}</div>
                        <div className={`text-caption font-medium ${appointmentStateClass(row.attended, row.appointmentState)}`}>
                          {appointmentStateLabel(row.attended, row.appointmentState)}
                        </div>
                      </TableCell>
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
                      <TableCellMoney>
                        <span className={row.daysSinceConsult > 30 ? "font-semibold text-(--color-danger)" : undefined}>
                          {row.daysSinceConsult}d
                        </span>
                      </TableCellMoney>
                      <TableCell>
                        <Badge variant={row.statusKey === "converted" || row.statusKey === "completed" ? "success" : "neutral"}>
                          {row.statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setDetailRow(row)}>
                            Details
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditRow(row)}>
                            Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TablePanel>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-caption text-(--color-text-tertiary)">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-(--color-success)" />
            Attended
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-(--color-success)" />
            Has Active Plan
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-(--color-success)" />
            Deposit Paid
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-(--color-success)" />
            Treatment Booked
          </span>
        </div>
          </>
        )}
      </div>

      <DashboardEditDialog
        row={editRow}
        dentists={data.dentists}
        planDisplayName={data.planDisplayName}
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

      <Dialog open={syncLogOpen} onOpenChange={setSyncLogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sync log</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div
              className="max-h-64 overflow-y-auto rounded-(--radius-md) bg-(--color-bg-subtle) p-3 font-mono text-caption"
              data-testid="flow-sync-log"
            >
              {syncLog.length === 0 ? (
                <p className="text-(--color-text-tertiary)">No sync activity yet.</p>
              ) : (
                syncLog.map((line, i) => (
                  <div key={`${line.at}-${i}`} className="mb-1 last:mb-0">
                    <span className="text-(--color-text-tertiary)">
                      {new Date(line.at).toLocaleTimeString("en-GB")}
                    </span>{" "}
                    {line.message}
                  </div>
                ))
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSyncLogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
