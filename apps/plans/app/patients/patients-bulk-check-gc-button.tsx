"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, toast } from "@elio/ui";
import { CreditCard } from "lucide-react";

/** Bulk Check GoCardless — link mandates for patients missing DD (P2.6). */
export function PatientsBulkCheckGcButton() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleBulkCheck() {
    setLoading(true);
    try {
      const res = await fetch("/plans/api/admin/bulk-check-gc", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Bulk GoCardless check failed");
        return;
      }
      toast.success(`Bulk check complete — ${data.linked} mandate(s) linked from ${data.checked} patient(s)`, {
        description: data.errors?.length ? data.errors.slice(0, 2).join("; ") : undefined,
        duration: data.errors?.length ? 8000 : 4000,
      });
      router.refresh();
    } catch {
      toast.error("Bulk GoCardless check failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleBulkCheck} loading={loading}>
      <CreditCard className="mr-2 size-4" />
      Check GoCardless
    </Button>
  );
}
