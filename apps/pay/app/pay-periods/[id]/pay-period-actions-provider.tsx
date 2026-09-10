"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";
import { toast } from "@elio/ui";

export interface FetchSummaryEntry {
  invoicedPence: number;
  paidPence?: number;
  outstandingPence?: number;
  invoiceCount: number;
  financeCount?: number;
  flaggedCount?: number;
  chairMins?: number;
  grossPerHour?: number;
  netPerHour?: number;
  utilizationPercent?: number;
}

export interface FetchResult {
  ok: boolean;
  message: string;
  summary?: Record<string, FetchSummaryEntry>;
  debug?: {
    totalInvoicesFromApi?: number;
    invoicesInDateRange: number;
    processedInvoices: number;
    appointmentsFetched?: number;
    financePayments?: number;
    flaggedForReview?: number;
    skippedNonClinician?: number;
    skippedNhs?: number;
    unmatchedClinicianIds: string[];
    unmappedPractitioners?: Array<{
      practitionerId: string;
      amountPence: number;
      treatment: string;
      invoiceDate: string;
    }>;
  };
}

interface PayPeriodActionsContextValue {
  payPeriodId: string;
  locked: boolean;
  payslipCount: number;
  anyProvisional: boolean;
  fetching: boolean;
  locking: boolean;
  unlocking: boolean;
  downloading: boolean;
  emailing: boolean;
  fetchResult: FetchResult | null;
  /** Live phase label while fetching ("invoices", "appointments", ...) — null once settled. */
  fetchPhase: string | null;
  actionError: string | null;
  fetchDismissed: boolean;
  dismissFetchResult: () => void;
  fetchFromDentally: () => Promise<void>;
  lockPeriod: () => Promise<void>;
  unlockPeriod: () => Promise<void>;
  downloadAllPdfs: () => Promise<void>;
  emailAllPayslips: () => Promise<void>;
}

const PayPeriodActionsContext = createContext<PayPeriodActionsContextValue | null>(null);

export function usePayPeriodActions() {
  const ctx = useContext(PayPeriodActionsContext);
  if (!ctx) throw new Error("usePayPeriodActions must be used within PayPeriodActionsProvider");
  return ctx;
}

export function PayPeriodActionsProvider({
  payPeriodId,
  dentistIds,
  locked,
  payslipCount,
  anyProvisional = false,
  initialFetchResult = null,
  children,
}: {
  payPeriodId: string;
  dentistIds: string[];
  locked: boolean;
  payslipCount: number;
  anyProvisional?: boolean;
  initialFetchResult?: FetchResult | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [fetching, setFetching] = React.useState(false);
  const [locking, setLocking] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [emailing, setEmailing] = React.useState(false);
  const [fetchResult, setFetchResult] = React.useState<FetchResult | null>(initialFetchResult);
  const [fetchPhase, setFetchPhase] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [fetchDismissed, setFetchDismissed] = React.useState(false);

  React.useEffect(() => {
    if (initialFetchResult?.ok) {
      setFetchResult(initialFetchResult);
    }
  }, [initialFetchResult]);

  const fetchFromDentally = React.useCallback(async () => {
    setFetching(true);
    setActionError(null);
    setFetchResult(null);
    setFetchPhase(null);
    setFetchDismissed(false);
    try {
      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/fetch-dentally`, { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        status?: string;
      };
      if (!res.ok && res.status !== 202) {
        const msg = data.error ?? "Failed to fetch from Dentally";
        setActionError(msg);
        toast.error(msg);
        return;
      }
      if (res.status === 202 || data.status === "RUNNING") {
        toast.info(data.message || "Fetching from Dentally…");
      }

      // Poll DB status until background job finishes (Step 3 — no Dentally on render).
      // The server-side heartbeat check (PAY_DENTALLY_FETCH_HEARTBEAT_STALE_MS) flips a
      // truly dead `after()` job to ERROR within minutes, so this loop always gets a
      // definite answer well before the 10-minute client deadline below in practice.
      const deadline = Date.now() + 10 * 60 * 1000;
      let final: FetchResult | null = null;
      let firstPoll = true;
      let consecutiveNetworkErrors = 0;
      while (Date.now() < deadline) {
        if (!firstPoll) await new Promise((r) => setTimeout(r, 1500));
        firstPoll = false;

        let statusRes: Response;
        let statusData: { status?: string; error?: string; result?: FetchResult | null; phase?: string | null };
        try {
          statusRes = await fetch(`/pay/api/pay-periods/${payPeriodId}/fetch-dentally`);
          statusData = await statusRes.json();
        } catch {
          // A transient network blip mid-poll shouldn't abort a multi-minute wait —
          // only give up after several in a row.
          consecutiveNetworkErrors++;
          if (consecutiveNetworkErrors >= 5) {
            const msg = "Lost connection while checking Dentally fetch status — try Refresh.";
            setActionError(msg);
            toast.error(msg);
            return;
          }
          continue;
        }
        consecutiveNetworkErrors = 0;

        if (!statusRes.ok) {
          const msg = statusData.error ?? "Failed to read Dentally fetch status";
          setActionError(msg);
          toast.error(msg);
          return;
        }
        if (statusData.status === "RUNNING") {
          setFetchPhase(statusData.phase ?? null);
        }
        if (statusData.status === "SUCCESS" && statusData.result) {
          final = statusData.result;
          break;
        }
        if (statusData.status === "ERROR") {
          const msg = statusData.error ?? "Dentally fetch failed";
          setActionError(msg);
          toast.error(msg);
          return;
        }
      }
      if (!final) {
        const msg = "Dentally fetch timed out — try again or check the period later";
        setActionError(msg);
        toast.error(msg);
        return;
      }

      setFetchResult(final);
      toast.success(final.message || "Fetched from Dentally");
      // Step 34 — do not auto-calculate; ops must confirm finance/labs/therapy/UDAs first, then Run calculation.
      toast.info("Review finance terms and ops fields, then run calculation");

      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setFetching(false);
      setFetchPhase(null);
    }
  }, [dentistIds, payPeriodId, router]);

  const lockPeriod = React.useCallback(async () => {
    setLocking(true);
    setActionError(null);
    try {
      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/lock`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string }).error ?? "Lock failed";
        setActionError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Pay period locked");
      router.refresh();
    } finally {
      setLocking(false);
    }
  }, [payPeriodId, router]);

  const unlockPeriod = React.useCallback(async () => {
    setUnlocking(true);
    setActionError(null);
    try {
      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/unlock`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string }).error ?? "Reopen failed";
        setActionError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Pay period reopened");
      router.refresh();
    } finally {
      setUnlocking(false);
    }
  }, [payPeriodId, router]);

  const downloadAllPdfs = React.useCallback(async () => {
    setDownloading(true);
    setActionError(null);
    try {
      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/download-all`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string }).error ?? "Download failed";
        setActionError(msg);
        toast.error(msg);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "payslips.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Payslips downloaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  }, [payPeriodId]);

  const emailAllPayslips = React.useCallback(async () => {
    setEmailing(true);
    setActionError(null);
    try {
      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/send-all-emails`, { method: "POST" });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        const msg = data.error ?? "Failed to send emails";
        setActionError(msg);
        toast.error(msg);
        return;
      }
      const successMsg = data.message ?? "Emails sent";
      setFetchResult({ ok: true, message: successMsg });
      setFetchDismissed(false);
      toast.success(successMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send emails";
      setActionError(msg);
      toast.error(msg);
    } finally {
      setEmailing(false);
    }
  }, [payPeriodId]);

  const value: PayPeriodActionsContextValue = {
    payPeriodId,
    locked,
    payslipCount,
    anyProvisional,
    fetching,
    locking,
    unlocking,
    downloading,
    emailing,
    fetchResult,
    fetchPhase,
    actionError,
    fetchDismissed,
    dismissFetchResult: () => setFetchDismissed(true),
    fetchFromDentally,
    lockPeriod,
    unlockPeriod,
    downloadAllPdfs,
    emailAllPayslips,
  };

  return <PayPeriodActionsContext.Provider value={value}>{children}</PayPeriodActionsContext.Provider>;
}
