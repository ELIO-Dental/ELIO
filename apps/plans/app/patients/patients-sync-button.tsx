"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, toast } from "@elio/ui";
import { RefreshCw } from "lucide-react";

type SyncResult = {
  imported: number;
  updated?: number;
  skipped: number;
  total: number;
  plansMatched?: number;
  errors?: string[];
  noEmailPatients?: string[];
};

/** Manual Dentally bulk sync (P2.2). */
export function PatientsSyncButton() {
  const router = useRouter();
  const [syncing, setSyncing] = React.useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/plans/api/dentally/sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as SyncResult & { error?: string; configured?: boolean };

      if (!res.ok) {
        toast.error(data.error ?? "Sync failed", {
          description: data.configured === false ? "Add your Dentally API key in Portal → Settings → Integrations." : undefined,
          duration: 8000,
        });
        return;
      }

      const parts = [
        `${data.imported} imported`,
        data.updated ? `${data.updated} updated` : null,
        `${data.skipped} skipped`,
        `${data.total} found`,
      ].filter(Boolean);

      toast.success(`Dentally sync complete — ${parts.join(", ")}`, {
        description:
          data.errors && data.errors.length > 0
            ? `${data.errors.length} issue(s): ${data.errors.slice(0, 2).join("; ")}`
            : data.noEmailPatients && data.noEmailPatients.length > 0
              ? `Missing email: ${data.noEmailPatients.slice(0, 3).join(", ")}`
              : undefined,
        duration: data.errors?.length ? 8000 : 4000,
      });

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
