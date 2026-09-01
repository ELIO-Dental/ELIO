"use client";

import * as React from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from "@elio/ui";
import type { FlowDashboardRow } from "@/lib/flow-service";

const NONE = "__none__";

const LEGACY_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "thinking", label: "Thinking" },
  { value: "failed-finance", label: "Failed Finance" },
  { value: "price-shopping", label: "Price Shopping" },
  { value: "bad-experience", label: "Bad Experience" },
  { value: "out-of-budget", label: "Out of Budget" },
  { value: "converted", label: "Converted" },
  { value: "completed", label: "Completed" },
  { value: "declined", label: "Declined" },
] as const;

export function DashboardEditDialog({
  row,
  dentists,
  open,
  onOpenChange,
  onSaved,
}: {
  row: FlowDashboardRow | null;
  dentists: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [legacyStatus, setLegacyStatus] = React.useState("new");
  const [practitionerDentistId, setPractitionerDentistId] = React.useState(NONE);
  const [quoteOverride, setQuoteOverride] = React.useState("");
  const [planSignedUp, setPlanSignedUp] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!row) return;
    setLegacyStatus(row.statusKey === "stuck" ? "thinking" : row.statusKey);
    setPractitionerDentistId(row.dentistId ?? NONE);
    setQuoteOverride(row.quotePenceOverride !== null ? String(row.quotePenceOverride / 100) : "");
    setPlanSignedUp(row.planSignedUp);
    setNotes(row.notes ?? "");
  }, [row]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setSaving(true);
    try {
      const res = await fetch(`/flow/api/consults/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legacyStatus,
          practitionerDentistId: practitionerDentistId === NONE ? null : practitionerDentistId,
          quotePenceOverride: quoteOverride.trim() === "" ? null : Math.round(Number(quoteOverride) * 100),
          planSignedUp,
          notes: notes.trim() === "" ? null : notes,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to save");
      toast.success("Patient updated");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error("Couldn't save changes", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row?.patientName ?? "Edit patient"}</DialogTitle>
          <DialogDescription>Update pipeline status and manual fields — same as legacy ElioFlow edit modal.</DialogDescription>
        </DialogHeader>

        {row ? (
          <form onSubmit={save} className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select value={legacyStatus} onValueChange={setLegacyStatus}>
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEGACY_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-dentist">Dentist</Label>
              <Select value={practitionerDentistId} onValueChange={setPractitionerDentistId}>
                <SelectTrigger id="edit-dentist">
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

            <div>
              <Label htmlFor="edit-quote-override">Plan value override (£)</Label>
              <Input
                id="edit-quote-override"
                type="number"
                step="0.01"
                min="0"
                placeholder={row.quotePence !== null ? String(row.quotePence / 100) : "Synced from Dentally"}
                value={quoteOverride}
                onChange={(e) => setQuoteOverride(e.target.value)}
              />
              <p className="mt-1 text-caption text-(--color-text-tertiary)">
                Leave blank to use synced plan value (£{(row.planValuePence / 100).toFixed(2)}).
              </p>
            </div>

            <div className="flex items-center justify-between rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-2">
              <div>
                <Label htmlFor="edit-plan-signed-up">Plan signed up (elioCare)</Label>
                <p className="text-caption text-(--color-text-tertiary)">Touch points: {row.touchPoints} (sent reminders)</p>
              </div>
              <Switch id="edit-plan-signed-up" checked={planSignedUp} onCheckedChange={setPlanSignedUp} />
            </div>

            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea id="edit-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
