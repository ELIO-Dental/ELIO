"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, toast } from "@elio/ui";

/**
 * Form month/year are the PERIOD being paid for (e.g. June).
 * §6.0 trigger is the 15th of the NEXT month (July 15 → pays June).
 */
function triggerDateForPeriodMonth(month: number, year: number): string {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-15`;
}

export function NewPayPeriodForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const month = Number(form.get("month"));
    const year = Number(form.get("year"));
    const triggerDate = triggerDateForPeriodMonth(month, year);
    const res = await fetch("/pay/api/pay-periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggerDate }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error ?? "Failed to create pay period";
      setError(msg);
      toast.error(msg);
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { period?: { id?: string } };
    toast.success("Pay period created");
    if (data.period?.id) {
      router.push(`/pay-periods/${data.period.id}`);
      return;
    }
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  const now = new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a pay period</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="month">Period month</Label>
            <Input id="month" name="month" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} required />
          </div>
          <div>
            <Label htmlFor="year">Year</Label>
            <Input id="year" name="year" type="number" defaultValue={now.getFullYear()} required />
          </div>
          <div>
            {error && <p className="mb-2 text-body-sm text-(--color-danger)">{error}</p>}
            <Button type="submit" loading={submitting}>
              Create pay period
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
