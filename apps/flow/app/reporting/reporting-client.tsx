"use client";

import * as React from "react";
import { Input, Label, Button, toast, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState, TablePanel, TableToolbar, Skeleton } from "@elio/ui";
import { FlowStatCard } from "@/components/flow-stat-card";

export interface ConversionReport {
  totalConsultations: number;
  attended: number;
  converted: number;
  declined: number;
  thinking: number;
  stuck: number;
  conversionRate: number;
  totalPipelineValuePence: number;
  totalPlannedPence: number;
  totalPaidPence: number;
  averagePlanValuePence: number;
  avgDaysToConvert: number | null;
  byDentist: {
    dentistId: string | null;
    name: string;
    totalConsultations: number;
    converted: number;
    closed: number;
    conversionRate: number;
  }[];
}

export function ReportingClient({ initialReport }: { initialReport: ConversionReport }) {
  const [report, setReport] = React.useState<ConversionReport>(initialReport);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function applyFilter() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      // basePath is "/flow" — raw fetch() calls are NOT auto-prefixed by Next.
      const res = await fetch(`/flow/api/reporting${params.toString() ? `?${params.toString()}` : ""}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to load report");
      setReport(await res.json());
    } catch (err) {
      toast.error("Couldn't load reporting for that range", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  function clearFilter() {
    setFrom("");
    setTo("");
    setReport(initialReport);
  }

  async function refreshReport() {
    if (from && to) {
      await applyFilter();
      return;
    }
    setReport(initialReport);
  }

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-(--radius-lg) border border-(--color-border) p-4">
        <div>
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button loading={loading} onClick={applyFilter} disabled={!from || !to}>
          Apply
        </Button>
        <Button variant="secondary" onClick={clearFilter} disabled={loading}>
          Clear (all-time)
        </Button>
      </div>

      {loading ? (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-(--radius-lg)" />
            ))}
          </div>
          <Skeleton className="mt-8 h-64 w-full rounded-(--radius-lg)" />
        </>
      ) : (
        <>
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <FlowStatCard label="Total consultations" value={report.totalConsultations} />
        <FlowStatCard label="Attended" value={report.attended} />
        <FlowStatCard label="Converted" value={report.converted} />
        <FlowStatCard label="Conversion rate" value={report.conversionRate} suffix="%" />
        <FlowStatCard label="Stuck (thinking)" value={report.stuck} />
        <FlowStatCard label="Declined" value={report.declined} />
        <FlowStatCard label="Avg plan value" value={report.averagePlanValuePence} money />
        <FlowStatCard
          label="Avg days to convert"
          value={report.avgDaysToConvert ?? 0}
          suffix={report.avgDaysToConvert === null ? "" : "d"}
        />
      </div>

      <TablePanel
        className="mt-8"
        toolbar={<TableToolbar title="By practitioner" onRefresh={refreshReport} />}
      >
        {report.byDentist.length === 0 ? (
          <EmptyState title="No consults recorded yet" description="Practitioner breakdown will appear once consults are logged." className="py-12" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Practitioner</TableHead>
                <TableHead>Consultations</TableHead>
                <TableHead>Converted</TableHead>
                <TableHead>Conversion rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.byDentist.map((row) => (
                <TableRow key={row.dentistId ?? "unassigned"}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-(--color-text-secondary)">{row.totalConsultations}</TableCell>
                  <TableCell className="text-(--color-text-secondary)">{row.converted}</TableCell>
                  <TableCell className="text-(--color-text-secondary)">{row.conversionRate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TablePanel>
        </>
      )}
    </div>
  );
}
