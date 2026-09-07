"use client";

import * as React from "react";
import { AlertCircle, Download, Mail, Save } from "lucide-react";
import { Button, toast } from "@elio/ui";

/** AuraPay bottom bar: PDF · Email (left) · Save (right). */
export function PayslipEmailActions({
  payslipEntryId,
  dentistEmail,
  pdfHref,
  provisional = false,
  onSave,
  saving = false,
  showSave = false,
}: {
  payslipEntryId: string;
  dentistEmail: string | null;
  pdfHref: string;
  provisional?: boolean;
  onSave?: () => void;
  saving?: boolean;
  showSave?: boolean;
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
        const msg = data.error ?? "Failed to send email";
        setError(msg);
        toast.error(msg);
        return;
      }
      const successMsg = data.message ?? "Email sent";
      setMessage(successMsg);
      toast.success(successMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send email";
      setError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-t border-(--color-border-subtle) pt-4"
      data-testid="payslip-footer-actions"
    >
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={pdfHref}
          className="inline-flex items-center gap-1.5 rounded-(--radius-md) px-3 py-2 text-body-sm font-medium text-(--color-text-secondary) transition hover:bg-(--color-primary-50) hover:text-(--color-primary-600)"
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
          title={
            !hasEmail
              ? "No email address set"
              : provisional
                ? `Send PROVISIONAL payslip to ${dentistEmail}`
                : `Send to ${dentistEmail}`
          }
          data-testid={`send-payslip-email-${payslipEntryId}`}
        >
          <Mail className="size-4" aria-hidden />
          {provisional ? "Email (provisional)" : "Email"}
        </Button>
        {!hasEmail ? (
          <span className="inline-flex items-center gap-1 text-caption text-(--color-warning)">
            <AlertCircle className="size-3.5" aria-hidden />
            No email set
          </span>
        ) : null}
        {provisional ? (
          <span className="inline-flex items-center gap-1 text-caption text-(--color-warning)">
            <AlertCircle className="size-3.5" aria-hidden />
            Email will be labelled PROVISIONAL
          </span>
        ) : null}
        {message ? <span className="text-caption text-(--color-success)">{message}</span> : null}
        {error ? <span className="text-caption text-(--color-danger)">{error}</span> : null}
      </div>
      {showSave && onSave ? (
        <Button type="button" size="sm" loading={saving} onClick={onSave} data-testid="payslip-footer-save">
          <Save className="size-3.5" aria-hidden />
          Save
        </Button>
      ) : null}
    </div>
  );
}
