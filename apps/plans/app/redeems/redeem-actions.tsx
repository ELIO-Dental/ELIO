"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  Label,
  Textarea,
} from "@elio/ui";

export function RedeemActions({ redeemId }: { redeemId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"approve" | "reject" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");

  async function decide(decision: "approve" | "reject", rejectionReason?: string) {
    setPending(decision);
    setError(null);
    const body: { decision: string; rejectionReason?: string } = { decision };
    if (decision === "reject" && rejectionReason) body.rejectionReason = rejectionReason;
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
      <Button
        size="sm"
        variant="secondary"
        loading={pending === "reject"}
        onClick={() => {
          setRejectReason("");
          setRejectOpen(true);
        }}
      >
        Reject
      </Button>
      {error && <span className="text-body-sm text-(--color-danger)">{error}</span>}

      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setRejectReason("");
        }}
      >
        <DialogContent className="overflow-hidden">
          <DialogHeader>
            <DialogTitle>Reject redeem</DialogTitle>
            <DialogDescription>You can add an optional reason for the audit log.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Already redeemed this month"
              className="mt-1 min-h-24"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={pending === "reject"}
              onClick={async () => {
                await decide("reject", rejectReason.trim() || undefined);
                setRejectOpen(false);
              }}
            >
              Reject redeem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
