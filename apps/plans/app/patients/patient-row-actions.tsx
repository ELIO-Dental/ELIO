"use client";

import * as React from "react";
import { Mail, CreditCard } from "lucide-react";
import { Button, toast } from "@elio/ui";

/** Legacy patients-table Actions: Invite + Setup DD (emails via existing APIs). */
export function PatientRowActions({
  planPatientId,
  status,
  hasEmail,
}: {
  planPatientId: string;
  status: string;
  hasEmail: boolean;
}) {
  const [pending, setPending] = React.useState<"invite" | "dd" | null>(null);

  async function invite() {
    setPending("invite");
    try {
      const res = await fetch(`/plans/api/patients/${planPatientId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendEmail: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; signupUrl?: string };
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      toast.success(data.signupUrl ? "Invite sent" : "Invite created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setPending(null);
    }
  }

  async function setupDd() {
    setPending("dd");
    try {
      const res = await fetch(`/plans/api/patients/${planPatientId}/send-dd-link`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "DD link failed");
      toast.success("Direct Debit link emailed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "DD link failed");
    } finally {
      setPending(null);
    }
  }

  const showInvite = ["INVITED", "SIGNED", "PENDING_DD", "ACTIVE", "PAUSED"].includes(status);
  const showDd = ["SIGNED", "PENDING_DD", "ACTIVE", "PAUSED"].includes(status);

  if (!showInvite && !showDd) return <span className="text-caption text-(--color-text-tertiary)">—</span>;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {showInvite ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={pending === "invite"}
          disabled={!hasEmail || pending !== null}
          title={hasEmail ? "Send signup invite" : "No email on patient"}
          onClick={() => void invite()}
          data-testid={`patient-invite-${planPatientId}`}
        >
          <Mail className="size-3.5" aria-hidden />
          Invite
        </Button>
      ) : null}
      {showDd ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          loading={pending === "dd"}
          disabled={!hasEmail || pending !== null}
          title={hasEmail ? "Email Direct Debit setup link" : "No email on patient"}
          onClick={() => void setupDd()}
          data-testid={`patient-setup-dd-${planPatientId}`}
        >
          <CreditCard className="size-3.5" aria-hidden />
          Setup DD
        </Button>
      ) : null}
    </div>
  );
}
