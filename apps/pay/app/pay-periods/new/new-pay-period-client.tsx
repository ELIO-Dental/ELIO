"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label, PageContent, toast } from "@elio/ui";

/** AuraPay new-period defaults: previous calendar month. */
function defaultPeriodMonthYear(now = new Date()): { month: number; year: number } {
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return { month, year };
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i).toLocaleString("en-GB", { month: "long" }),
}));

export function NewPayPeriodClient() {
  const router = useRouter();
  const defaults = React.useMemo(() => defaultPeriodMonthYear(), []);
  const [month, setMonth] = React.useState(defaults.month);
  const [year, setYear] = React.useState(defaults.year);
  const [loading, setLoading] = React.useState(false);

  async function create() {
    setLoading(true);
    try {
      const res = await fetch("/pay/api/pay-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        period?: { id?: string };
        created?: boolean;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create pay period");
        return;
      }
      if (!data.period?.id) {
        toast.error("Period created but no id returned");
        return;
      }
      toast.success(data.created === false ? "Opened existing period" : "Pay period created");
      router.push(`/pay-periods/${data.period.id}`);
    } catch {
      toast.error("Failed to create pay period");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContent>
      <div className="mx-auto mt-8 max-w-md">
        <div className="space-y-6 rounded-2xl border border-(--color-border-subtle) bg-(--color-surface) p-8">
          <div>
            <h1 className="text-h3 text-(--color-text-primary)">Create Pay Period</h1>
            <p className="mt-1 text-sm text-(--color-text-secondary)">
              Select the month and year for the new payslip period. Entries will be created for all
              active dentists.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="month">Month</Label>
              <select
                id="month"
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                className="mt-1.5 w-full rounded-lg border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-(--color-brand)"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10) || year)}
                className="mt-1.5"
              />
            </div>
          </div>
          <Button className="w-full" loading={loading} onClick={() => void create()}>
            Create Period
          </Button>
          <p className="text-center text-sm text-(--color-text-tertiary)">
            <Link href="/pay-periods" className="text-(--color-brand) hover:underline">
              Back to Pay Periods
            </Link>
          </p>
        </div>
      </div>
    </PageContent>
  );
}
