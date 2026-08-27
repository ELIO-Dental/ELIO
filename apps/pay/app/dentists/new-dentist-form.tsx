"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Card, CardContent, CardHeader, CardTitle } from "@elio/ui";

export function NewDentistForm() {
  const router = useRouter();
  const [payType, setPayType] = React.useState<"PERCENTAGE_SPLIT" | "HOURLY">("PERCENTAGE_SPLIT");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      name: form.get("name"),
      nhsPerformerNumber: form.get("nhsPerformerNumber"),
      payType,
    };
    if (payType === "PERCENTAGE_SPLIT") {
      body.privateSplitPercent = Number(form.get("privateSplitPercent"));
      body.udaRatePence = Math.round(Number(form.get("udaRate")) * 100);
    } else {
      body.hourlyRatePence = Math.round(Number(form.get("hourlyRate")) * 100);
    }

    const res = await fetch("/pay/api/dentists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create dentist");
      return;
    }
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a dentist</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="nhsPerformerNumber">NHS performer number</Label>
            <Input id="nhsPerformerNumber" name="nhsPerformerNumber" />
          </div>
          <div>
            <Label htmlFor="payType">Pay type</Label>
            <Select value={payType} onValueChange={(v) => setPayType(v as "PERCENTAGE_SPLIT" | "HOURLY")}>
              <SelectTrigger id="payType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENTAGE_SPLIT">Percentage split (dentist)</SelectItem>
                <SelectItem value="HOURLY">Hourly (therapist/hygienist)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {payType === "PERCENTAGE_SPLIT" ? (
            <>
              <div>
                <Label htmlFor="privateSplitPercent">Private split %</Label>
                <Input id="privateSplitPercent" name="privateSplitPercent" type="number" step="0.01" required />
              </div>
              <div>
                <Label htmlFor="udaRate">UDA rate (£)</Label>
                <Input id="udaRate" name="udaRate" type="number" step="0.01" required />
              </div>
            </>
          ) : (
            <div>
              <Label htmlFor="hourlyRate">Hourly rate (£)</Label>
              <Input id="hourlyRate" name="hourlyRate" type="number" step="0.01" required />
            </div>
          )}
          <div className="sm:col-span-2">
            {error && <p className="mb-2 text-body-sm text-(--color-danger)">{error}</p>}
            <Button type="submit" loading={submitting}>
              Add dentist
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
