"use client";

import * as React from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatCard,
} from "@elio/ui";
import { MoneyStatCard } from "@/components/money-stat-card";
import type { ReportsData } from "@/lib/reports-service";

const TABS = ["overview", "revenue", "redeems", "breakage"] as const;
type TabId = (typeof TABS)[number];

export function ReportsClient({
  data,
  canViewFinancial,
}: {
  data: ReportsData;
  canViewFinancial: boolean;
}) {
  const [tab, setTab] = React.useState<TabId>("overview");
  const [exporting, setExporting] = React.useState(false);

  const visibleTabs = TABS.filter((t) => {
    if (t === "revenue" || t === "breakage") return canViewFinancial;
    return true;
  });

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await fetch("/plans/api/reports/export");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `elio-plans-reports-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const { overview, revenue, redeems, breakage } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {visibleTabs.map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}>
              <Badge variant={tab === t ? "primary" : "neutral"}>
                {t === "breakage" ? "Breakage & BI" : t.charAt(0).toUpperCase() + t.slice(1)}
              </Badge>
            </button>
          ))}
        </div>
        {canViewFinancial && (
          <Button variant="secondary" size="sm" loading={exporting} onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        )}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total patients" value={overview.totalPatients} />
          <StatCard label="Active" value={overview.activePatients} />
          <StatCard label="Paused" value={overview.pausedPatients} />
          <StatCard label="Active plans" value={overview.activePlans} />
        </div>
      )}

      {tab === "revenue" && canViewFinancial && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MoneyStatCard label="Total collected" value={revenue.totalCollectedPence} />
            <MoneyStatCard label="Pending" value={revenue.totalPendingPence} />
            <MoneyStatCard label="Failed" value={revenue.totalFailedPence} />
            <MoneyStatCard label="Avg per patient" value={revenue.avgPerPatientPence} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Plan profitability</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="py-8 text-center text-body-sm text-(--color-text-tertiary)">
                Profitability analysis will be calculated from live data once patients and payments are active.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "redeems" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total redeems" value={redeems.totalRedeems} />
            <StatCard label="Approved" value={redeems.approvedRedeems} />
            <StatCard label="Pending" value={redeems.pendingRedeems} />
            <StatCard label="Rejected" value={redeems.rejectedRedeems} />
          </div>
          {Object.keys(redeems.redeemsByType).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Redeems by type</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-(--color-border-subtle)">
                  {Object.entries(redeems.redeemsByType).map(([type, count]) => (
                    <li key={type} className="flex items-center justify-between py-3 text-body-sm">
                      <span>{type}</span>
                      <Badge variant="neutral">{count}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "breakage" && canViewFinancial && (
        <div className="space-y-6">
          <Card accentColor="var(--color-warning)">
            <CardHeader>
              <CardTitle>Breakage tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-body-sm text-(--color-text-secondary)">
                Patients paying but not redeeming their benefits — this is revenue you keep.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) p-4 text-center">
                  <p className="text-h2 font-semibold text-(--color-warning)">{breakage.patientsNotRedeeming}</p>
                  <p className="text-caption text-(--color-text-tertiary)">Not redeeming</p>
                </div>
                <div className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) p-4 text-center">
                  <p className="text-h2 font-semibold">{breakage.totalActivePatients}</p>
                  <p className="text-caption text-(--color-text-tertiary)">Total active</p>
                </div>
                <div className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) p-4 text-center">
                  <p className="text-h2 font-semibold text-(--color-warning)">{breakage.breakageRate.toFixed(1)}%</p>
                  <p className="text-caption text-(--color-text-tertiary)">Breakage rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Provider load impact</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="py-8 text-center text-body-sm text-(--color-text-tertiary)">
                Provider load analysis requires Dentally appointment data integration. Configure Dentally in Portal →
                Settings → Integrations to enable this report.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
