import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export interface SyncAlertProps {
  configured: boolean;
  connectionStatus: "NOT_CONNECTED" | "CONNECTED" | "ERROR";
  latestStatus: string | null;
  errorMessage: string | null;
  finishedAt: string | null;
}

export function SyncStatusBanner({
  configured,
  connectionStatus,
  latestStatus,
  errorMessage,
  finishedAt,
}: SyncAlertProps) {
  const showNotConfigured = !configured;
  const showFailed = connectionStatus === "ERROR" || latestStatus === "FAILED";
  const showPartial = latestStatus === "PARTIAL";
  const showRunning = latestStatus === "RUNNING";

  if (!showNotConfigured && !showFailed && !showPartial && !showRunning) return null;

  const tone = showNotConfigured
    ? "border-(--color-warning-200) bg-(--color-warning-50) text-(--color-warning-800)"
    : showFailed
      ? "border-(--color-danger-200) bg-(--color-danger-50) text-(--color-danger-800)"
      : showRunning
        ? "border-(--color-info-200) bg-(--color-info-50) text-(--color-info-800)"
        : "border-(--color-warning-200) bg-(--color-warning-50) text-(--color-warning-800)";

  const title = showNotConfigured
    ? "Dentally not connected"
    : showFailed
      ? "Dentally sync failed"
      : showRunning
        ? "Dentally sync in progress"
        : "Dentally sync completed with warnings";

  const detail = showNotConfigured
    ? "Patient and appointment data will not update until you add your Dentally API key."
    : (errorMessage ??
      (showPartial
        ? "Some records could not be imported. Open Integrations for details."
        : showRunning
          ? "A background sync is running — refresh Integrations for live status."
          : "Check Integrations for the latest error."));

  return (
    <div
      className={`mx-auto mb-6 flex w-full max-w-6xl flex-col gap-3 rounded-(--radius-lg) border px-6 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-10 ${tone}`}
      data-testid="dentally-sync-alert"
      role="status"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-body-sm opacity-90">{detail}</p>
          {finishedAt && !showRunning && !showNotConfigured ? (
            <p className="mt-1 text-caption opacity-75">Last attempt: {new Date(finishedAt).toLocaleString("en-GB")}</p>
          ) : null}
        </div>
      </div>
      <Link
        href="/settings/integrations"
        className="shrink-0 text-body-sm font-semibold underline underline-offset-2 hover:opacity-80"
      >
        Open Integrations
      </Link>
    </div>
  );
}
