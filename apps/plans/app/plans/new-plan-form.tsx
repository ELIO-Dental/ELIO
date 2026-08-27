"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle } from "@elio/ui";

export function NewPlanForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get("name"),
      monthlyPricePence: Math.round(Number(form.get("monthlyPrice")) * 100),
      description: form.get("description") || undefined,
    };
    const res = await fetch("/plans/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create plan");
      return;
    }
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a plan</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Plan name</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="monthlyPrice">Monthly price (£)</Label>
            <Input id="monthlyPrice" name="monthlyPrice" type="number" step="0.01" required />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <div className="sm:col-span-2">
            {error && <p className="mb-2 text-body-sm text-[--color-danger]">{error}</p>}
            <Button type="submit" loading={submitting}>
              Add plan
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
