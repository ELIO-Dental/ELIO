"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle, toast } from "@elio/ui";

/** AuraPay new-period defaults: previous calendar month. */
function defaultPeriodMonthYear(now = new Date()): { month: number; year: number } {
  const month = now.getMonth() === 0 ? 12 : now.getMonth(); // getMonth is 0-based; prev = current index
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  return { month, year };
}

export function NewPayPeriodForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const defaults = React.useMemo(() => defaultPeriodMonthYear(), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const month = Number(form.get("month"));
    const year = Number(form.get("year"));
    const res = await fetch("/pay/api/pay-periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, year }),
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a pay period</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="month">Period month</Label>
            <Input
              id="month"
              name="month"
              type="number"
              min={1}
              max={12}
              defaultValue={defaults.month}
              required
            />
          </div>
          <div>
            <Label htmlFor="year">Year</Label>
            <Input id="year" name="year" type="number" defaultValue={defaults.year} required />
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
