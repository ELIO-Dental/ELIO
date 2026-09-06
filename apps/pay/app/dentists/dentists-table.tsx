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
  toast,
} from "@elio/ui";
import { Pencil } from "lucide-react";

function bpToPercentLabel(bp: number | null): string {
  if (bp == null) return "practice";
  return `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;
}

function percentToBp(raw: string): number | null {
  if (raw.trim() === "") return null;
  return Math.round(Number(raw) * 100);
}

interface DentistRow {
  id: string;
  name: string;
  email: string | null;
  nhsPerformerNumber: string | null;
  dentallyPractitionerId: string | null;
  payType: string;
  privateSplitPercent: unknown;
  udaRatePence: number | null;
  hourlyRatePence: number | null;
  labShareBp: number | null;
  financeShareBp: number | null;
  therapyHourlyPence: number | null;
}

export function DentistsTable({ dentists }: { dentists: DentistRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [practitionerId, setPractitionerId] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [nhsPerformer, setNhsPerformer] = React.useState("");
  const [splitPercent, setSplitPercent] = React.useState("");
  const [udaRate, setUdaRate] = React.useState("");
  const [hourlyRate, setHourlyRate] = React.useState("");
  const [labSharePct, setLabSharePct] = React.useState("");
  const [financeSharePct, setFinanceSharePct] = React.useState("");
  const [therapyHourly, setTherapyHourly] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function saveDentist(dentistId: string, payType: string) {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        dentallyPractitionerId: practitionerId.trim() || null,
        email: email.trim() || null,
        nhsPerformerNumber: nhsPerformer.trim() || null,
        labShareBp: percentToBp(labSharePct),
        financeShareBp: percentToBp(financeSharePct),
        therapyHourly: therapyHourly === "" ? null : Number(therapyHourly),
      };
      if (payType === "PERCENTAGE_SPLIT") {
        body.privateSplitPercent = splitPercent === "" ? null : Number(splitPercent);
        body.udaRate = udaRate === "" ? null : Number(udaRate);
      } else {
        body.hourlyRate = hourlyRate === "" ? null : Number(hourlyRate);
      }
      const res = await fetch(`/pay/api/dentists/${dentistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      setEditingId(null);
      toast.success("Dentist updated (rate version recorded)");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setError(msg);
      toast.error(msg);
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
            <TableHead>Email</TableHead>
            <TableHead>Dentally ID</TableHead>
            <TableHead>NHS performer #</TableHead>
            <TableHead>Pay type</TableHead>
            <TableHead>Split % / UDA rate</TableHead>
            <TableHead>Lab / finance share</TableHead>
            <TableHead>Therapy £/hr</TableHead>
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
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@clinic.com"
                    className="text-sm"
                  />
                ) : (
                  <span className="text-sm break-all">{d.email ?? "—"}</span>
                )}
              </TableCell>
              <TableCell>
                {editingId === d.id ? (
                  <Input
                    value={practitionerId}
                    onChange={(e) => setPractitionerId(e.target.value)}
                    placeholder="user.id"
                    className="font-mono text-sm"
                  />
                ) : (
                  <span className="font-mono text-sm">{d.dentallyPractitionerId ?? "—"}</span>
                )}
              </TableCell>
              <TableCell>
                {editingId === d.id ? (
                  <Input
                    value={nhsPerformer}
                    onChange={(e) => setNhsPerformer(e.target.value)}
                    placeholder="NHS #"
                    className="font-mono text-sm"
                  />
                ) : (
                  d.nhsPerformerNumber ?? "—"
                )}
              </TableCell>
              <TableCell>{d.payType === "HOURLY" ? "Therapist" : "Associate"}</TableCell>
              <TableCell>
                {d.payType === "PERCENTAGE_SPLIT" ? (
                  editingId === d.id ? (
                    <div className="flex gap-1">
                      <Input
                        type="number"
                        step="0.01"
                        value={splitPercent}
                        onChange={(e) => setSplitPercent(e.target.value)}
                        className="w-16 text-sm"
                        title="Split %"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={udaRate}
                        onChange={(e) => setUdaRate(e.target.value)}
                        className="w-20 text-sm"
                        title="UDA £"
                      />
                    </div>
                  ) : (
                    `${d.privateSplitPercent ?? "—"}% / ${formatMoneyGBP(d.udaRatePence ?? 0)}`
                  )
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                {editingId === d.id ? (
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={labSharePct}
                      onChange={(e) => setLabSharePct(e.target.value)}
                      className="w-16 text-sm"
                      title="Lab share %"
                      placeholder="lab %"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={financeSharePct}
                      onChange={(e) => setFinanceSharePct(e.target.value)}
                      className="w-16 text-sm"
                      title="Finance share %"
                      placeholder="fin %"
                    />
                  </div>
                ) : (
                  <span className="text-sm">
                    {bpToPercentLabel(d.labShareBp)} / {bpToPercentLabel(d.financeShareBp)}
                  </span>
                )}
              </TableCell>
              <TableCell>
                {editingId === d.id ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={therapyHourly}
                    onChange={(e) => setTherapyHourly(e.target.value)}
                    className="w-20 text-sm"
                    title="Therapy £/hr"
                    placeholder="35"
                  />
                ) : d.therapyHourlyPence != null ? (
                  formatMoneyGBP(d.therapyHourlyPence)
                ) : (
                  "£35"
                )}
              </TableCell>
              <TableCellMoney>
                {d.payType === "HOURLY" ? (
                  editingId === d.id ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      className="w-24 text-sm"
                    />
                  ) : (
                    `${formatMoneyGBP(d.hourlyRatePence ?? 0)}/hr`
                  )
                ) : (
                  "—"
                )}
              </TableCellMoney>
              <TableCell>
                {editingId === d.id ? (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => void saveDentist(d.id, d.payType)} loading={saving}>
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
                    aria-label={`Edit ${d.name}`}
                    onClick={() => {
                      setEditingId(d.id);
                      setPractitionerId(d.dentallyPractitionerId ?? "");
                      setEmail(d.email ?? "");
                      setNhsPerformer(d.nhsPerformerNumber ?? "");
                      setSplitPercent(d.privateSplitPercent != null ? String(d.privateSplitPercent) : "");
                      setUdaRate(d.udaRatePence != null ? (d.udaRatePence / 100).toFixed(2) : "");
                      setHourlyRate(d.hourlyRatePence != null ? (d.hourlyRatePence / 100).toFixed(2) : "");
                      setLabSharePct(d.labShareBp != null ? (d.labShareBp / 100).toString() : "");
                      setFinanceSharePct(d.financeShareBp != null ? (d.financeShareBp / 100).toString() : "");
                      setTherapyHourly(
                        d.therapyHourlyPence != null ? (d.therapyHourlyPence / 100).toFixed(2) : ""
                      );
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
