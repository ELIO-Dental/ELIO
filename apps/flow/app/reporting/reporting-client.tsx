"use client";

import * as React from "react";
import { Input, Label, Button, toast } from "@elio/ui";
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

  return (
    <div>
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-[--radius-lg] border border-[--color-border] p-4">
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

      <div className="mt-8 rounded-[--radius-lg] border border-[--color-border]">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="border-b border-[--color-border] text-left text-caption text-[--color-text-tertiary]">
              <th className="px-4 py-3 font-medium">Practitioner</th>
              <th className="px-4 py-3 font-medium">Consultations</th>
              <th className="px-4 py-3 font-medium">Converted</th>
              <th className="px-4 py-3 font-medium">Conversion rate</th>
            </tr>
          </thead>
          <tbody>
            {report.byDentist.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[--color-text-tertiary]">
                  No consults recorded yet.
                </td>
              </tr>
            ) : (
              report.byDentist.map((row) => (
                <tr key={row.dentistId ?? "unassigned"} className="border-b border-[--color-border-subtle] last:border-0">
                  <td className="px-4 py-3 text-[--color-text-primary]">{row.name}</td>
                  <td className="px-4 py-3 text-[--color-text-secondary]">{row.totalConsultations}</td>
                  <td className="px-4 py-3 text-[--color-text-secondary]">{row.converted}</td>
                  <td className="px-4 py-3 text-[--color-text-secondary]">{row.conversionRate}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
