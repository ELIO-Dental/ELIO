"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, toast } from "@elio/ui";
import { RefreshCw } from "lucide-react";
import type { PatientsSyncResult } from "./patients-sync-result-banner";

/** Manual Dentally bulk sync (P2.2). */
export function PatientsSyncButton({ onComplete }: { onComplete?: (result: PatientsSyncResult) => void }) {
  const router = useRouter();
  const [syncing, setSyncing] = React.useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/plans/api/dentally/sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as PatientsSyncResult & { error?: string; configured?: boolean };

      if (!res.ok) {
        toast.error(data.error ?? "Sync failed", {
          description: data.configured === false ? "Add your Dentally API key in Portal → Settings → Integrations." : undefined,
          duration: 8000,
        });
        return;
      }

      toast.success("Patients synced from Dentally");
      onComplete?.(data);
      router.refresh();
    } catch {
      toast.error("Failed to sync from Dentally");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Button variant="secondary" onClick={handleSync} loading={syncing}>
      <RefreshCw className="mr-2 size-4" />
      Sync from Dentally
    </Button>
  );
}
