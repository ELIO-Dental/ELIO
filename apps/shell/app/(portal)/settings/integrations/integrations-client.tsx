"use client";

import * as React from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  useSkeleton,
} from "@elio/ui";
import { RefreshCw } from "lucide-react";

interface SyncCounts {
  patients?: number;
  appointments?: number;
  invoices?: number;
  treatments?: number;
  payments?: number;
  accounts?: number;
  paymentPlans?: number;
}

interface IntegrationStatus {
  configured: boolean;
  hasPracticeKey: boolean;
  connectionStatus: "NOT_CONNECTED" | "CONNECTED" | "ERROR";
  connectionOk: boolean | null;
  connectionError: string | null;
  latestRun: {
    id: string;
    status: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    counts: SyncCounts | null;
    errorMessage: string | null;
    recordErrorCount: number;
  } | null;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  CONNECTED: "success",
  NOT_CONNECTED: "neutral",
  ERROR: "danger",
  RUNNING: "info",
  STARTING: "info",
  SUCCESS: "success",
  PARTIAL: "warning",
  FAILED: "danger",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function fetchStatus(testConnection = false): Promise<IntegrationStatus> {
  const url = testConnection ? "/api/dentally/status?test=1" : "/api/dentally/status";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load status (${res.status})`);
  return res.json();
}

export function IntegrationsClient({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = React.useState<IntegrationStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  /** True after enqueue until DB shows RUNNING (Inngest create-sync-run lag). */
  const [awaitingStart, setAwaitingStart] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [savingKey, setSavingKey] = React.useState(false);
  const [apiKey, setApiKey] = React.useState("");
  const [keySaved, setKeySaved] = React.useState(false);
  const loading = useSkeleton(!status && !error);
  const runIdBeforeEnqueue = React.useRef<string | null>(null);

  const load = React.useCallback(async (testConnection = false) => {
    try {
      setError(null);
      const next = await fetchStatus(testConnection);
      setStatus(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integration status");
      return null;
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const displayStatus = awaitingStart ? "STARTING" : status?.latestRun?.status ?? null;
  const isBusy = syncing || awaitingStart || status?.latestRun?.status === "RUNNING";

  // Poll while a sync is starting or actively running.
  React.useEffect(() => {
    if (!awaitingStart && status?.latestRun?.status !== "RUNNING") return;
    const intervalMs = awaitingStart ? 1500 : 3000;
    const timer = setInterval(() => {
      void load().then((next) => {
        if (!next) return;
        const run = next.latestRun;
        if (!run) return;
        if (awaitingStart) {
          const isNewRun = run.id !== runIdBeforeEnqueue.current;
          if (run.status === "RUNNING" || (isNewRun && run.status === "RUNNING")) {
            setAwaitingStart(false);
          } else if (
            isNewRun &&
            (run.status === "SUCCESS" || run.status === "PARTIAL" || run.status === "FAILED")
          ) {
            setAwaitingStart(false);
          }
        }
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [awaitingStart, status?.latestRun?.status, load]);

  // Safety: stop "Starting…" after 90s if Inngest never creates a row.
  React.useEffect(() => {
    if (!awaitingStart) return;
    const timeout = setTimeout(() => {
      setAwaitingStart(false);
      setError(
        "Sync was queued but has not started yet. Check Inngest / refresh in a moment — do not click Sync now again if a job is already running."
      );
      void load();
    }, 90_000);
    return () => clearTimeout(timeout);
  }, [awaitingStart, load]);

  async function onSaveApiKey(e: React.FormEvent) {
    e.preventDefault();
    setSavingKey(true);
    setError(null);
    setKeySaved(false);
    try {
      const res = await fetch("/api/dentally/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      setApiKey("");
      setKeySaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setSavingKey(false);
    }
  }

  async function onSyncNow() {
    setSyncing(true);
    setError(null);
    runIdBeforeEnqueue.current = status?.latestRun?.id ?? null;
    try {
      const res = await fetch("/api/dentally/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `Sync failed (${res.status})`);
      }
      // Optimistic UI: Inngest creates the RUNNING row only after the first step.
      setAwaitingStart(true);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              latestRun: {
                id: prev.latestRun?.id ?? "pending",
                status: "STARTING",
                trigger: "manual",
                startedAt: new Date().toISOString(),
                finishedAt: null,
                counts: null,
                errorMessage: null,
                recordErrorCount: 0,
              },
            }
          : prev
      );
      void load().then((next) => {
        if (next?.latestRun?.status === "RUNNING") {
          setAwaitingStart(false);
        }
      });
    } catch (err) {
      setAwaitingStart(false);
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function onTestConnection() {
    setTesting(true);
    try {
      await load(true);
    } finally {
      setTesting(false);
    }
  }

  const counts = status?.latestRun?.counts ?? null;
  const resultBadgeStatus = displayStatus ?? status?.latestRun?.status;

  return (
    <Card className="border-(--color-border-subtle) shadow-(--shadow-sm)" data-testid="dentally-integrations">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Dentally</CardTitle>
          <p className="mt-1 text-body-sm text-(--color-text-secondary)">
            Sync patients, appointments, and invoices from Dentally into ELIO.
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[status?.connectionStatus ?? "NOT_CONNECTED"] ?? "neutral"}>
          {status?.connectionStatus?.replace("_", " ") ?? "Loading…"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <p className="text-body-sm text-(--color-text-secondary)">Loading integration status…</p>
        ) : (
          <>
            {canManage && (
              <form
                onSubmit={onSaveApiKey}
                className="space-y-3 rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-bg-subtle)/60 p-4"
              >
                <div>
                  <Label htmlFor="dentally-api-key">Dentally API key</Label>
                  <p className="mt-1 text-body-sm text-(--color-text-tertiary)">
                    {status?.hasPracticeKey
                      ? "A key is saved for this practice. Enter a new key to replace it."
                      : "Add your practice API key from Dentally → Settings → API."}
                  </p>
                </div>
                <Input
                  id="dentally-api-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste Dentally API key"
                  data-testid="dentally-api-key-input"
                />
                <Button type="submit" loading={savingKey} disabled={!apiKey.trim()} data-testid="dentally-api-key-save">
                  Save API key
                </Button>
                {keySaved && (
                  <p className="text-body-sm text-(--color-success)">API key saved. Run a connection test or sync now.</p>
                )}
              </form>
            )}

            <dl className="grid gap-3 text-body-sm sm:grid-cols-2">
              <div>
                <dt className="text-(--color-text-tertiary)">API key configured</dt>
                <dd className="font-medium text-(--color-text-primary)">
                  {status?.configured
                    ? status.hasPracticeKey
                      ? "Yes — practice key on file"
                      : "Yes — platform default (dev/single-tenant)"
                    : "No — add a key above"}
                </dd>
              </div>
              <div>
                <dt className="text-(--color-text-tertiary)">Last sync</dt>
                <dd className="font-medium text-(--color-text-primary)">
                  {formatWhen(status?.latestRun?.finishedAt ?? status?.latestRun?.startedAt ?? null)}
                </dd>
              </div>
              <div>
                <dt className="text-(--color-text-tertiary)">Last sync result</dt>
                <dd>
                  {resultBadgeStatus ? (
                    <Badge variant={STATUS_VARIANT[resultBadgeStatus] ?? "neutral"}>
                      {resultBadgeStatus === "STARTING" ? "STARTING…" : resultBadgeStatus}
                    </Badge>
                  ) : (
                    "Never synced"
                  )}
                </dd>
              </div>
              {counts && !awaitingStart && status?.latestRun?.status !== "RUNNING" && (
                <div>
                  <dt className="text-(--color-text-tertiary)">Records synced (last run)</dt>
                  <dd className="font-medium text-(--color-text-primary)">
                    {counts.patients ?? 0} patients · {counts.appointments ?? 0} appts · {counts.invoices ?? 0} invoices
                    {(counts.payments ?? 0) > 0 ? ` · ${counts.payments} payments` : ""}
                    {(counts.accounts ?? 0) > 0 ? ` · ${counts.accounts} accounts` : ""}
                    {(counts.paymentPlans ?? 0) > 0 ? ` · ${counts.paymentPlans} payment plans` : ""}
                  </dd>
                </div>
              )}
            </dl>

            {(awaitingStart || status?.latestRun?.status === "RUNNING") && (
              <p className="rounded-(--radius-md) border border-(--color-primary-500)/30 bg-(--color-primary-50) px-3 py-2 text-body-sm text-(--color-text-primary)">
                {awaitingStart
                  ? "Sync queued — waiting for the background worker to start (usually a few seconds)."
                  : "Sync is running in the background. This page refreshes automatically."}
              </p>
            )}

            {status?.latestRun?.errorMessage && !isBusy && (
              <p className="rounded-(--radius-md) border border-(--color-danger) bg-(--color-danger-bg) px-3 py-2 text-body-sm text-(--color-danger)">
                {status.latestRun.errorMessage}
              </p>
            )}

            {status?.latestRun && status.latestRun.recordErrorCount > 0 && !isBusy && (
              <p className="text-body-sm text-(--color-warning)">
                {status.latestRun.recordErrorCount} individual record(s) failed on the last sync — data may be partially
                stale.
              </p>
            )}

            {status?.connectionOk === false && status.connectionError && (
              <p className="rounded-(--radius-md) border border-(--color-danger) bg-(--color-danger-bg) px-3 py-2 text-body-sm text-(--color-danger)">
                Connection test failed: {status.connectionError}
              </p>
            )}

            {status?.connectionOk === true && (
              <p className="text-body-sm text-(--color-success)">Connection test succeeded.</p>
            )}

            {error && (
              <p className="rounded-(--radius-md) border border-(--color-danger) bg-(--color-danger-bg) px-3 py-2 text-body-sm text-(--color-danger)">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              {canManage && (
                <Button
                  onClick={onSyncNow}
                  loading={syncing || awaitingStart || status?.latestRun?.status === "RUNNING"}
                  disabled={!status?.configured || isBusy}
                  data-testid="dentally-sync-now"
                >
                  {awaitingStart
                    ? "Starting…"
                    : status?.latestRun?.status === "RUNNING"
                      ? "Syncing…"
                      : "Sync now"}
                </Button>
              )}
              {canManage && (
                <Button
                  variant="secondary"
                  onClick={onTestConnection}
                  loading={testing}
                  disabled={!status?.configured || isBusy}
                >
                  Test connection
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => void load()} data-testid="dentally-status-refresh">
                <RefreshCw className="mr-1 h-4 w-4" />
                Refresh
              </Button>
            </div>

            {!canManage && (
              <p className="text-body-sm text-(--color-text-tertiary)">
                Only practice owners and admins can manage the Dentally connection.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
