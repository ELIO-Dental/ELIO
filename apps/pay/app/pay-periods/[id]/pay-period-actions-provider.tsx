"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createContext, useContext } from "react";

export interface FetchSummaryEntry {
  invoicedPence: number;
  paidPence?: number;
  outstandingPence?: number;
  invoiceCount: number;
  financeCount?: number;
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
    invoicesInDateRange: number;
    processedInvoices: number;
    appointmentsFetched?: number;
    financePayments?: number;
    flaggedForReview?: number;
    unmatchedClinicianIds: string[];
  };
}

interface PayPeriodActionsContextValue {
  payPeriodId: string;
  locked: boolean;
  payslipCount: number;
  fetching: boolean;
  locking: boolean;
  unlocking: boolean;
  downloading: boolean;
  fetchResult: FetchResult | null;
  fetchError: string | null;
  fetchDismissed: boolean;
  dismissFetchResult: () => void;
  fetchFromDentally: () => Promise<void>;
  lockPeriod: () => Promise<void>;
  unlockPeriod: () => Promise<void>;
  downloadAllPdfs: () => Promise<void>;
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
  children,
}: {
  payPeriodId: string;
  dentistIds: string[];
  locked: boolean;
  payslipCount: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [fetching, setFetching] = React.useState(false);
  const [locking, setLocking] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [fetchResult, setFetchResult] = React.useState<FetchResult | null>(null);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [fetchDismissed, setFetchDismissed] = React.useState(false);

  const fetchFromDentally = React.useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    setFetchResult(null);
    setFetchDismissed(false);
    try {
      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/fetch-dentally`, { method: "POST" });
      const data = (await res.json()) as FetchResult & { error?: string };
      if (!res.ok) {
        setFetchError(data.error ?? "Failed to fetch from Dentally");
        return;
      }
      setFetchResult(data);

      if (dentistIds.length > 0) {
        await fetch(`/pay/api/pay-periods/${payPeriodId}/calculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dentists: dentistIds.map((dentistId) => ({ dentistId })) }),
        });
      }

      router.refresh();
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Network error");
    } finally {
      setFetching(false);
    }
  }, [dentistIds, payPeriodId, router]);

  const lockPeriod = React.useCallback(async () => {
    setLocking(true);
    setFetchError(null);
    try {
      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/lock`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFetchError((data as { error?: string }).error ?? "Lock failed");
        return;
      }
      router.refresh();
    } finally {
      setLocking(false);
    }
  }, [payPeriodId, router]);

  const unlockPeriod = React.useCallback(async () => {
    setUnlocking(true);
    setFetchError(null);
    try {
      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/unlock`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFetchError((data as { error?: string }).error ?? "Reopen failed");
        return;
      }
      router.refresh();
    } finally {
      setUnlocking(false);
    }
  }, [payPeriodId, router]);

  const downloadAllPdfs = React.useCallback(async () => {
    setDownloading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/download-all`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFetchError((data as { error?: string }).error ?? "Download failed");
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
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [payPeriodId]);

  const value: PayPeriodActionsContextValue = {
    payPeriodId,
    locked,
    payslipCount,
    fetching,
    locking,
    unlocking,
    downloading,
    fetchResult,
    fetchError,
    fetchDismissed,
    dismissFetchResult: () => setFetchDismissed(true),
    fetchFromDentally,
    lockPeriod,
    unlockPeriod,
    downloadAllPdfs,
  };

  return <PayPeriodActionsContext.Provider value={value}>{children}</PayPeriodActionsContext.Provider>;
}
