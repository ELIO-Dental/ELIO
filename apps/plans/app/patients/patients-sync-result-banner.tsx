"use client";

import { Button } from "@elio/ui";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

export type PatientsSyncResult = {
  imported: number;
  updated?: number;
  skipped: number;
  total: number;
  plansMatched?: number;
  errors?: string[];
  noEmailPatients?: string[];
};

/** Dismissible sync result panel (legacy parity for P2.2). */
export function PatientsSyncResultBanner({
  result,
  onDismiss,
}: {
  result: PatientsSyncResult;
  onDismiss: () => void;
}) {
  const hasIssues = Boolean(result.errors?.length || result.noEmailPatients?.length);
  const parts = [
    `${result.imported} imported`,
    result.updated ? `${result.updated} updated` : null,
    `${result.skipped} skipped`,
    `${result.total} found in Dentally`,
    result.plansMatched != null ? `${result.plansMatched} plan(s) matched` : null,
  ].filter(Boolean);

  return (
    <div
      className={`rounded-(--radius-lg) border p-4 ${
        hasIssues
          ? "border-(--color-warning)/40 bg-(--color-warning-subtle)"
          : "border-(--color-success)/40 bg-(--color-success-subtle)"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          {hasIssues ? (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-(--color-warning)" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-(--color-success)" />
          )}
          <div className="space-y-2">
            <p className="text-body-sm font-medium text-(--color-text-primary)">Dentally sync complete — {parts.join(", ")}</p>
            {result.errors && result.errors.length > 0 && (
              <ul className="list-inside list-disc space-y-1 text-body-sm text-(--color-text-secondary)">
                {result.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            )}
            {result.noEmailPatients && result.noEmailPatients.length > 0 && (
              <p className="text-body-sm text-(--color-text-secondary)">
                <span className="font-medium text-(--color-text-primary)">Missing email:</span>{" "}
                {result.noEmailPatients.join(", ")}
              </p>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dismiss sync result">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
