"use client";

import * as React from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@elio/ui";
import { PlansStatCard } from "@/components/plans-stat-card";
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
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex flex-wrap gap-1 rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-bg-subtle)/50 p-1"
          role="tablist"
        >
          {visibleTabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-(--radius-md) px-3 py-1.5 text-caption font-semibold capitalize transition-colors ${
                tab === t
                  ? "bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-xs)"
                  : "text-(--color-text-tertiary) hover:text-(--color-text-secondary)"
              }`}
            >
              {t === "breakage" ? "Breakage & BI" : t}
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
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <PlansStatCard label="Total patients" value={overview.totalPatients} tone="accent" />
          <PlansStatCard label="Active" value={overview.activePatients} tone="success" />
          <PlansStatCard label="Paused" value={overview.pausedPatients} tone="warning" />
          <PlansStatCard label="Active plans" value={overview.activePlans} />
        </div>
      )}

      {tab === "revenue" && canViewFinancial && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <PlansStatCard label="Total collected" value={revenue.totalCollectedPence} money tone="success" />
            <PlansStatCard label="Pending" value={revenue.totalPendingPence} money tone="warning" />
            <PlansStatCard label="Failed" value={revenue.totalFailedPence} money tone="danger" />
            <PlansStatCard label="Avg per patient" value={revenue.avgPerPatientPence} money />
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
            <PlansStatCard label="Dentist payout liability" value={revenue.dentistPayoutLiabilityPence} money />
            <PlansStatCard label="Estimated profit" value={revenue.estimatedProfitPence} money tone="success" />
          </div>
          <Card className="overflow-hidden shadow-(--shadow-xs)">
            <CardHeader className="border-b border-(--color-border-subtle) bg-(--color-bg-subtle)/40">
              <CardTitle>Plan profitability</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 p-4 text-body-sm text-(--color-text-secondary) sm:p-5">
              <p>
                Profit estimate = collected membership payments minus dentist payout for approved examination
                redeems (plan override or Settings → Payouts default).
              </p>
              {revenue.vatEnabled ? (
                <p className="text-(--color-text-tertiary)">VAT is enabled for this practice (display flag).</p>
              ) : (
                <p className="text-(--color-text-tertiary)">VAT is not enabled for this practice.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "redeems" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <PlansStatCard label="Total redeems" value={redeems.totalRedeems} />
            <PlansStatCard label="Approved" value={redeems.approvedRedeems} tone="success" />
            <PlansStatCard label="Pending" value={redeems.pendingRedeems} tone="warning" />
            <PlansStatCard label="Rejected" value={redeems.rejectedRedeems} tone="danger" />
          </div>
          {Object.keys(redeems.redeemsByType).length > 0 && (
            <Card className="overflow-hidden shadow-(--shadow-xs)">
              <CardHeader className="border-b border-(--color-border-subtle) bg-(--color-bg-subtle)/40">
                <CardTitle>Redeems by type</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                <ul className="divide-y divide-(--color-border-subtle)">
                  {Object.entries(redeems.redeemsByType).map(([type, count]) => (
                    <li key={type} className="flex items-center justify-between py-3 text-body-sm first:pt-0 last:pb-0">
                      <span className="font-medium text-(--color-text-primary)">{type}</span>
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
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
            <PlansStatCard label="Not redeeming" value={breakage.patientsNotRedeeming} tone="warning" />
            <PlansStatCard label="Total active" value={breakage.totalActivePatients} tone="accent" />
            <PlansStatCard label="Breakage rate %" value={Math.round(breakage.breakageRate)} tone="warning" />
          </div>
          <Card className="overflow-hidden shadow-(--shadow-xs)">
            <CardHeader className="border-b border-(--color-border-subtle) bg-(--color-bg-subtle)/40">
              <CardTitle>Breakage tracking</CardTitle>
            </CardHeader>
            <CardContent className="p-4 text-body-sm text-(--color-text-secondary) sm:p-5">
              Patients paying but not redeeming their benefits — this is revenue you keep.
            </CardContent>
          </Card>
          <Card className="overflow-hidden shadow-(--shadow-xs)">
            <CardHeader className="border-b border-(--color-border-subtle) bg-(--color-bg-subtle)/40">
              <CardTitle>Provider load impact</CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <p className="py-6 text-center text-body-sm text-(--color-text-tertiary)">
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
