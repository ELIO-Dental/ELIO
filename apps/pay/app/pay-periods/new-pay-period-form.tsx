"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle } from "@elio/ui";

export function NewPayPeriodForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    // The API takes a real trigger date (§6.0 — the 15th of the month after the period
    // being paid for), not a bare month/year — derive one from this form's month/year.
    const month = Number(form.get("month"));
    const year = Number(form.get("year"));
    const triggerDate = `${year}-${String(month).padStart(2, "0")}-15`;
    const res = await fetch("/pay/api/pay-periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggerDate }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create pay period");
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
            <Label htmlFor="month">Month</Label>
            <Input id="month" name="month" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} required />
          </div>
          <div>
            <Label htmlFor="year">Year</Label>
            <Input id="year" name="year" type="number" defaultValue={now.getFullYear()} required />
          </div>
          <div>
            {error && <p className="mb-2 text-body-sm text-[--color-danger]">{error}</p>}
            <Button type="submit" loading={submitting}>
              Create pay period
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
