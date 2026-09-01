"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCellMoney,
  formatMoneyGBP,
  Button,
  Input,
} from "@elio/ui";
import { Pencil } from "lucide-react";

interface DentistRow {
  id: string;
  name: string;
  nhsPerformerNumber: string | null;
  dentallyPractitionerId: string | null;
  payType: string;
  privateSplitPercent: unknown;
  udaRatePence: number | null;
  hourlyRatePence: number | null;
}

export function DentistsTable({ dentists }: { dentists: DentistRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [practitionerId, setPractitionerId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function savePractitionerId(dentistId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/pay/api/dentists/${dentistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dentallyPractitionerId: practitionerId.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {error && <p className="mb-2 text-body-sm text-(--color-danger)">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Dentally ID</TableHead>
            <TableHead>NHS performer #</TableHead>
            <TableHead>Pay type</TableHead>
            <TableHead>Split % / UDA rate</TableHead>
            <TableHead>Hourly rate</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {dentists.map((d) => (
            <TableRow key={d.id}>
              <TableCell>{d.name}</TableCell>
              <TableCell>
                {editingId === d.id ? (
                  <Input
                    value={practitionerId}
                    onChange={(e) => setPractitionerId(e.target.value)}
                    placeholder="Practitioner ID"
                    className="font-mono text-sm"
                  />
                ) : (
                  <span className="font-mono text-sm">{d.dentallyPractitionerId ?? "—"}</span>
                )}
              </TableCell>
              <TableCell>{d.nhsPerformerNumber ?? "—"}</TableCell>
              <TableCell>{d.payType}</TableCell>
              <TableCell>
                {d.payType === "PERCENTAGE_SPLIT"
                  ? `${d.privateSplitPercent}% / ${formatMoneyGBP(d.udaRatePence ?? 0)}`
                  : "—"}
              </TableCell>
              <TableCellMoney>
                {d.payType === "HOURLY" ? `${formatMoneyGBP(d.hourlyRatePence ?? 0)}/hr` : "—"}
              </TableCellMoney>
              <TableCell>
                {editingId === d.id ? (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => void savePractitionerId(d.id)} loading={saving}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Edit ${d.name} practitioner ID`}
                    onClick={() => {
                      setEditingId(d.id);
                      setPractitionerId(d.dentallyPractitionerId ?? "");
                      setError(null);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
