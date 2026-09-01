"use client";

import * as React from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@elio/ui";

interface DebugResponse {
  dentally_users_count: number;
  dentally_users: Array<{ id: string; name: string; role: string }>;
  unmatched_invoice_ids: Array<{ id: string; name?: string; count: number }>;
  stored_dentists: Array<{ id: string; name: string; dentally_practitioner_id: string | null }>;
  site_id: string;
}

export function DentallyConnectionPanel() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<DebugResponse | null>(null);

  async function checkConnection() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/pay/api/dentally/debug");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Connection check failed");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection check failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const sampleIds = data?.dentally_users.slice(0, 8).map((u) => u.id) ?? [];

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1 space-y-2">
          <div>
            <p className="text-sm font-medium text-amber-900">Dentally practitioner IDs</p>
            <p className="mt-1 text-xs text-amber-800">
              Each dentist needs a Dentally practitioner ID for invoice fetch attribution. Use bulk import on Setup or
              edit IDs below.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void checkConnection()} disabled={loading}>
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Check Dentally connection
          </Button>
          {error && <p className="text-xs text-red-700">{error}</p>}
          {data && (
            <div className="space-y-2 text-xs text-amber-900">
              <p>
                Connected to site <code className="rounded bg-white px-1">{data.site_id}</code> — {data.dentally_users_count}{" "}
                users found
              </p>
              {sampleIds.length > 0 && (
                <p>
                  <span className="font-medium">Sample IDs:</span> {sampleIds.join(", ")}
                </p>
              )}
              {data.unmatched_invoice_ids.length > 0 && (
                <div className="space-y-1 text-amber-800">
                  <p className="font-medium">
                    {data.unmatched_invoice_ids.length} unmapped practitioner ID(s) in recent invoices:
                  </p>
                  <ul className="list-inside list-disc">
                    {data.unmatched_invoice_ids.slice(0, 5).map((row) => (
                      <li key={row.id}>
                        <code className="rounded bg-white px-1">{row.id}</code>
                        {row.name ? ` — ${row.name}` : ""} ({row.count} invoices)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
