"use client";

import * as React from "react";
import { Mail } from "lucide-react";
import { Button, toast } from "@elio/ui";

/** Legacy payments-table Notify on FAILED rows. */
export function PaymentNotifyButton({
  paymentId,
  patientEmail,
}: {
  paymentId: string;
  patientEmail: string | null;
}) {
  const [pending, setPending] = React.useState(false);
  const hasEmail = Boolean(patientEmail?.trim());

  async function notify() {
    setPending(true);
    try {
      const res = await fetch(`/plans/api/payments/${paymentId}/notify`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Notify failed");
      toast.success(hasEmail ? `Reminder sent to ${patientEmail}` : "Notification logged");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Notify failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      loading={pending}
      disabled={!hasEmail || pending}
      title={hasEmail ? `Send reminder to ${patientEmail}` : "No email on patient"}
      onClick={() => void notify()}
      data-testid={`payment-notify-${paymentId}`}
    >
      <Mail className="size-3.5" aria-hidden />
      Notify
    </Button>
  );
}
