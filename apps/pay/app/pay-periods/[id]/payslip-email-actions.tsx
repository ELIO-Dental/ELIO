"use client";

import * as React from "react";
import { AlertCircle, Download, Mail } from "lucide-react";
import { Button } from "@elio/ui";

/** Per-payslip PDF download + email actions (legacy Y3.8). */
export function PayslipEmailActions({
  payslipEntryId,
  dentistEmail,
  pdfHref,
}: {
  payslipEntryId: string;
  dentistEmail: string | null;
  pdfHref: string;
}) {
  const [sending, setSending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const hasEmail = Boolean(dentistEmail?.trim());

  async function sendEmail() {
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/pay/api/payslips/${payslipEntryId}/send-email`, { method: "POST" });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to send email");
        return;
      }
      setMessage(data.message ?? "Email sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-(--color-border-subtle) pt-4">
      <a
        href={pdfHref}
        className="inline-flex items-center gap-1.5 text-body-sm font-medium text-(--color-brand) underline underline-offset-2"
      >
        <Download className="size-4" aria-hidden />
        PDF
      </a>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void sendEmail()}
        loading={sending}
        disabled={!hasEmail || sending}
        title={hasEmail ? `Send to ${dentistEmail}` : "No email address set"}
        data-testid={`send-payslip-email-${payslipEntryId}`}
      >
        <Mail className="size-4" aria-hidden />
        Email
      </Button>
      {!hasEmail ? (
        <span className="inline-flex items-center gap-1 text-caption text-(--color-warning)">
          <AlertCircle className="size-3.5" aria-hidden />
          No email set
        </span>
      ) : null}
      {message ? <span className="text-caption text-(--color-success)">{message}</span> : null}
      {error ? <span className="text-caption text-(--color-danger)">{error}</span> : null}
    </div>
  );
}
