"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@elio/ui";

export function RedeemActions({ redeemId }: { redeemId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"approve" | "reject" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    setPending(decision);
    setError(null);
    const body: { decision: string; rejectionReason?: string } = { decision };
    if (decision === "reject") {
      const reason = window.prompt("Reason for rejecting this redeem (optional):") ?? undefined;
      body.rejectionReason = reason;
    }
    const res = await fetch(`/plans/api/redeems/${redeemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to update redeem");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="primary" loading={pending === "approve"} onClick={() => decide("approve")}>
        Approve
      </Button>
      <Button size="sm" variant="secondary" loading={pending === "reject"} onClick={() => decide("reject")}>
        Reject
      </Button>
      {error && <span className="text-body-sm text-[--color-danger]">{error}</span>}
    </div>
  );
}
