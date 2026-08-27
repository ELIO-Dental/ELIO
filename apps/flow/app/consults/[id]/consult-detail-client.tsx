"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  Switch,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  toast,
  Badge,
} from "@elio/ui";

type Appointment = {
  id: string;
  startsAt: string | null;
  reason: string | null;
  dentallyState: string | null;
};

type Reminder = {
  id: string;
  dueAt: string;
  sentAt: string | null;
  channel: string | null;
};

interface ConsultDetail {
  id: string;
  quotePence: number | null;
  quotePenceOverride: number | null;
  hasDeposit: boolean | null;
  treatmentBooked: boolean | null;
  practitionerDentistId: string | null;
  notes: string | null;
  outcome: string | null;
  stuckReason: string | null;
  totalPaidPence: number | null;
  attended: boolean | null;
  appointmentId: string | null;
  appointment: Appointment | null;
}

const NONE = "__none__";
const STUCK_REASONS = [
  { value: "FAILED_FINANCE", label: "Failed finance" },
  { value: "PRICE_SHOPPING", label: "Price shopping" },
  { value: "BAD_EXPERIENCE", label: "Bad experience" },
  { value: "OUT_OF_BUDGET", label: "Out of budget" },
];

function money(pence: number | null) {
  if (pence === null || pence === undefined) return "—";
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ConsultDetailClient({
  consult,
  dentists,
  hasLinkedPatient,
  linkableAppointments,
  reminders,
}: {
  consult: ConsultDetail;
  dentists: { id: string; name: string }[];
  hasLinkedPatient: boolean;
  linkableAppointments: Appointment[];
  reminders: Reminder[];
}) {
  const router = useRouter();

  const [quotePence, setQuotePence] = React.useState(consult.quotePence !== null ? String(consult.quotePence / 100) : "");
  const [hasDeposit, setHasDeposit] = React.useState(Boolean(consult.hasDeposit));
  const [treatmentBooked, setTreatmentBooked] = React.useState(Boolean(consult.treatmentBooked));
  const [practitionerDentistId, setPractitionerDentistId] = React.useState(consult.practitionerDentistId ?? NONE);
  const [notes, setNotes] = React.useState(consult.notes ?? "");
  const [savingDetails, setSavingDetails] = React.useState(false);

  const [outcome, setOutcome] = React.useState(consult.outcome ?? NONE);
  const [stuckReason, setStuckReason] = React.useState(consult.stuckReason ?? NONE);
  const [savingOutcome, setSavingOutcome] = React.useState(false);

  const [linkingId, setLinkingId] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);

  async function saveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingDetails(true);
    try {
      const res = await fetch(`/flow/api/consults/${consult.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotePence: quotePence.trim() === "" ? null : Math.round(Number(quotePence) * 100),
          hasDeposit,
          treatmentBooked,
          practitionerDentistId: practitionerDentistId === NONE ? null : practitionerDentistId,
          notes: notes.trim() === "" ? null : notes,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to save");
      toast.success("Consult details saved");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't save consult details", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveOutcome() {
    if (outcome === NONE) return;
    setSavingOutcome(true);
    try {
      const res = await fetch(`/flow/api/consults/${consult.id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          stuckReason: outcome === "ACCEPTED" || stuckReason === NONE ? undefined : stuckReason,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to record outcome");
      toast.success("Outcome recorded");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't record outcome", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSavingOutcome(false);
    }
  }

  async function linkAppointment(appointmentId: string) {
    setLinkingId(appointmentId);
    try {
      const res = await fetch(`/flow/api/consults/${consult.id}/link-appointment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to link appointment");
      toast.success("Appointment linked");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't link appointment", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setLinkingId(null);
    }
  }

  async function syncFinancials() {
    setSyncing(true);
    try {
      const res = await fetch(`/flow/api/consults/${consult.id}/sync-financials`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to sync financials");
      toast.success("Financials synced from Dentally");
      router.refresh();
    } catch (err) {
      toast.error("Couldn't sync financials", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Consult details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDetails} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="quote">Quote (£)</Label>
              <Input
                id="quote"
                type="number"
                step="0.01"
                min="0"
                value={quotePence}
                onChange={(e) => setQuotePence(e.target.value)}
              />
              {consult.quotePenceOverride !== null && (
                <p className="mt-1 text-caption text-[--color-text-tertiary]">
                  Override applied: {money(consult.quotePenceOverride)}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="practitioner">Practitioner</Label>
              <Select value={practitionerDentistId} onValueChange={setPractitionerDentistId}>
                <SelectTrigger id="practitioner">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {dentists.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-[--radius-md] border border-[--color-border-subtle] px-3 py-2">
              <Label htmlFor="deposit">Deposit taken</Label>
              <Switch id="deposit" checked={hasDeposit} onCheckedChange={setHasDeposit} />
            </div>
            <div className="flex items-center justify-between rounded-[--radius-md] border border-[--color-border-subtle] px-3 py-2">
              <Label htmlFor="treatment-booked">Treatment booked</Label>
              <Switch id="treatment-booked" checked={treatmentBooked} onCheckedChange={setTreatmentBooked} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" loading={savingDetails}>
                Save details
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outcome</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            {consult.outcome && (
              <Badge>
                Current: {consult.outcome}
                {consult.stuckReason ? ` (${consult.stuckReason})` : ""}
              </Badge>
            )}
            <div>
              <Label htmlFor="outcome">New outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger id="outcome">
                  <SelectValue placeholder="Select outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACCEPTED">Accepted</SelectItem>
                  <SelectItem value="THINKING">Thinking</SelectItem>
                  <SelectItem value="DECLINED">Declined</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(outcome === "THINKING" || outcome === "DECLINED") && (
              <div>
                <Label htmlFor="stuck-reason">Reason</Label>
                <Select value={stuckReason} onValueChange={setStuckReason}>
                  <SelectTrigger id="stuck-reason">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {STUCK_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={saveOutcome} loading={savingOutcome} disabled={outcome === NONE}>
              Record outcome
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dentally linking</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasLinkedPatient ? (
            <p className="text-body-sm text-[--color-text-tertiary]">
              This enquiry has no linked Dentally patient yet — link a patient to the enquiry before you can pick an
              appointment or sync financials.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {consult.appointment ? (
                <p className="text-body-sm text-[--color-text-secondary]">
                  Linked appointment:{" "}
                  {consult.appointment.startsAt
                    ? new Date(consult.appointment.startsAt).toLocaleString("en-GB")
                    : "unknown date"}
                  {consult.appointment.reason ? ` · ${consult.appointment.reason}` : ""}
                </p>
              ) : linkableAppointments.length === 0 ? (
                <p className="text-body-sm text-[--color-text-tertiary]">No candidate appointments found.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {linkableAppointments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between rounded-[--radius-md] border border-[--color-border-subtle] px-3 py-2"
                    >
                      <span className="text-body-sm text-[--color-text-secondary]">
                        {a.startsAt ? new Date(a.startsAt).toLocaleString("en-GB") : "unknown date"}
                        {a.reason ? ` · ${a.reason}` : ""}
                        {a.dentallyState ? ` · ${a.dentallyState}` : ""}
                      </span>
                      <Button size="sm" variant="secondary" loading={linkingId === a.id} onClick={() => linkAppointment(a.id)}>
                        Link
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <p className="text-body-sm text-[--color-text-secondary]">Paid to date: {money(consult.totalPaidPence)}</p>
                <Button className="mt-2" size="sm" variant="secondary" loading={syncing} onClick={syncFinancials}>
                  Sync financials from Dentally
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
        </CardHeader>
        <CardContent>
          {reminders.length === 0 ? (
            <p className="text-body-sm text-[--color-text-tertiary]">No reminders scheduled.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {reminders.map((r) => (
                <li key={r.id} className="text-body-sm text-[--color-text-secondary]">
                  {new Date(r.dueAt).toLocaleString("en-GB")}
                  {r.channel ? ` · ${r.channel}` : ""} — {r.sentAt ? "sent" : "pending"}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
