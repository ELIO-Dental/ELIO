"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Badge } from "@elio/ui";

export interface ReviewLine {
  id: string;
  performerNumber: string | null;
  rawDentistName: string | null;
  udas: string | null;
  superannuationPence: number | null;
}

export interface DentistOption {
  id: string;
  name: string;
}

/** §6.2 Manual Review screen — an unmatched/ambiguous Compass line gets confirmed/corrected
 * against a real Dentist, never guessed. Every correction writes an AuditLog row server-side. */
export function ManualReviewList({ lines, dentists }: { lines: ReviewLine[]; dentists: DentistOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  if (lines.length === 0) return null;

  async function confirm(lineId: string) {
    const dentistId = selected[lineId];
    if (!dentistId) return;
    setSubmitting(lineId);
    setErrors((e) => ({ ...e, [lineId]: "" }));
    try {
      const res = await fetch(`/pay/api/compass-lines/${lineId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dentistId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrors((e) => ({ ...e, [lineId]: data.error ?? "Failed to save — please retry." }));
        return;
      }
      router.refresh();
    } catch {
      setErrors((e) => ({ ...e, [lineId]: "Network error — please retry." }));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="mt-6 rounded-[--radius-lg] border border-[--color-warning] bg-[--color-warning-bg] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Badge variant="warning">Needs review</Badge>
        <span className="text-body-sm font-medium">{lines.length} Compass line(s) could not be auto-matched</span>
      </div>
      <ul className="space-y-3">
        {lines.map((line) => (
          <li key={line.id} className="flex flex-wrap items-center gap-3 rounded-[--radius-md] bg-[--color-bg] p-3">
            <div className="text-body-sm">
              <span className="font-medium">{line.rawDentistName ?? "Unknown name"}</span>{" "}
              <span className="text-[--color-text-tertiary]">(performer #{line.performerNumber ?? "?"})</span>
              <span className="ml-2 text-[--color-text-secondary]">
                UDAs: {line.udas ?? "—"} · Superann.: {line.superannuationPence != null ? `£${(line.superannuationPence / 100).toFixed(2)}` : "—"}
              </span>
              {errors[line.id] && <p className="mt-1 text-body-sm text-[--color-danger]">{errors[line.id]}</p>}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Select value={selected[line.id] ?? ""} onValueChange={(v) => setSelected((s) => ({ ...s, [line.id]: v }))}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Match to dentist…" />
                </SelectTrigger>
                <SelectContent>
                  {dentists.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                loading={submitting === line.id}
                disabled={!selected[line.id] || (submitting !== null && submitting !== line.id)}
                onClick={() => confirm(line.id)}
              >
                {errors[line.id] ? "Retry" : "Confirm"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
