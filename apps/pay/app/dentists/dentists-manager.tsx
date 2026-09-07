"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePanel,
  TableRow,
  TableToolbar,
  toast,
} from "@elio/ui";
import { DentallyConnectionPanel } from "./dentally-connection-panel";

export interface DentistListItem {
  id: string;
  name: string;
  email: string | null;
  nhsPerformerNumber: string | null;
  dentallyPractitionerId: string | null;
  isNhs: boolean;
  active: boolean;
  privateSplitPercent: unknown;
  udaRatePence: number | null;
}

type EditDraft = {
  id?: string;
  name: string;
  email: string;
  privateSplitPercent: string;
  udaRate: string;
  nhsPerformerNumber: string;
  dentallyPractitionerId: string;
  isNhs: boolean;
  active: boolean;
};

const emptyDraft = (): EditDraft => ({
  name: "",
  email: "",
  privateSplitPercent: "50",
  udaRate: "0",
  nhsPerformerNumber: "",
  dentallyPractitionerId: "",
  isNhs: false,
  active: true,
});

function splitLabel(value: unknown): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `${n}%` : "—";
}

function udaLabel(pence: number | null): string {
  if (pence == null || pence <= 0) return "—";
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
}

export function DentistsManager({ dentists }: { dentists: DentistListItem[] }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<EditDraft | null>(null);
  const [isNew, setIsNew] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<DentistListItem | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  function openCreate() {
    setIsNew(true);
    setDraft(emptyDraft());
  }

  function openEdit(d: DentistListItem) {
    setIsNew(false);
    setDraft({
      id: d.id,
      name: d.name,
      email: d.email ?? "",
      privateSplitPercent: d.privateSplitPercent != null ? String(Number(d.privateSplitPercent)) : "50",
      udaRate: d.udaRatePence != null ? (d.udaRatePence / 100).toString() : "0",
      nhsPerformerNumber: d.nhsPerformerNumber ?? "",
      dentallyPractitionerId: d.dentallyPractitionerId ?? "",
      isNhs: d.isNhs,
      active: d.active,
    });
  }

  function closeEdit() {
    if (saving) return;
    setDraft(null);
    setIsNew(false);
  }

  async function save() {
    if (!draft?.name.trim()) {
      toast.error("Full name is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: draft.name.trim(),
        email: draft.email.trim() || null,
        privateSplitPercent: Number(draft.privateSplitPercent) || 0,
        udaRate: Number(draft.udaRate) || 0,
        nhsPerformerNumber: draft.nhsPerformerNumber.trim() || null,
        dentallyPractitionerId: draft.dentallyPractitionerId.trim() || null,
        isNhs: draft.isNhs,
        active: draft.active,
        payType: "PERCENTAGE_SPLIT" as const,
        udaRatePence: Math.round((Number(draft.udaRate) || 0) * 100),
      };

      const res = isNew
        ? await fetch("/pay/api/dentists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/pay/api/dentists/${draft.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save dentist");

      toast.success(isNew ? "Dentist added" : "Dentist updated");
      setDraft(null);
      setIsNew(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save dentist");
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await fetch(`/pay/api/dentists/${removeTarget.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        mode?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to remove dentist");
      setNotice(data.message ?? `${removeTarget.name} was removed.`);
      setRemoveTarget(null);
      router.refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to remove dentist.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-(--color-text-primary)">Dentists</h1>
          <p className="mt-0.5 text-body-sm text-(--color-text-secondary)">
            Manage dentist profiles, splits, and rates
          </p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="mr-1.5 h-4 w-4" />
          Add Dentist
        </Button>
      </div>

      {notice && (
        <div className="flex items-start gap-3 rounded-xl border border-(--color-border-subtle) bg-(--color-bg-subtle) p-3 sm:p-4">
          <p className="flex-1 text-sm text-(--color-text-primary)">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-sm text-(--color-text-tertiary) hover:text-(--color-text-primary)"
          >
            Dismiss
          </button>
        </div>
      )}

      <DentallyConnectionPanel />

      <TablePanel toolbar={<TableToolbar title="Dentists" />}>
        {dentists.length === 0 ? (
          <EmptyState
            title="No dentists yet"
            description='Use "Add Dentist" to create one.'
            className="py-12"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[22%]">Name</TableHead>
                <TableHead className="w-[24%]">Email</TableHead>
                <TableHead className="text-center w-[16%]">Dentally ID</TableHead>
                <TableHead className="text-center w-[9%]">Split</TableHead>
                <TableHead className="text-center w-[7%]">NHS</TableHead>
                <TableHead className="text-center w-[9%]">UDA</TableHead>
                <TableHead className="text-center w-[10%]">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dentists.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium text-(--color-text-primary)">{d.name}</TableCell>
                  <TableCell className="break-all text-xs text-(--color-text-secondary)">
                    {d.email || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {d.dentallyPractitionerId ? (
                      <code className="rounded bg-(--color-bg-subtle) px-1.5 py-0.5 text-xs">
                        {d.dentallyPractitionerId}
                      </code>
                    ) : (
                      <span className="text-xs font-medium text-(--color-warning)">Not set</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center whitespace-nowrap">
                    {splitLabel(d.privateSplitPercent)}
                  </TableCell>
                  <TableCell className="text-center">
                    {d.isNhs ? (
                      <Check className="mx-auto h-4 w-4 text-(--color-success)" />
                    ) : (
                      <span className="text-(--color-text-tertiary)">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center whitespace-nowrap">{udaLabel(d.udaRatePence)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={d.active ? "success" : "danger"}>
                      {d.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${d.name}`}
                        title="Edit dentist"
                        onClick={() => openEdit(d)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-(--color-danger)"
                        aria-label={`Remove ${d.name}`}
                        title="Remove dentist"
                        onClick={() => {
                          setNotice(null);
                          setRemoveTarget(d);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TablePanel>

      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Dentist" : "Edit Dentist"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <>
              <DialogBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="dentist-name">Full Name</Label>
                  <Input
                    id="dentist-name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="dentist-email">Email</Label>
                  <Input
                    id="dentist-email"
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="dentist-split">Split %</Label>
                  <Input
                    id="dentist-split"
                    type="number"
                    step="0.01"
                    value={draft.privateSplitPercent}
                    onChange={(e) => setDraft({ ...draft, privateSplitPercent: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="dentist-uda">UDA Rate</Label>
                  <Input
                    id="dentist-uda"
                    type="number"
                    step="0.01"
                    value={draft.udaRate}
                    onChange={(e) => setDraft({ ...draft, udaRate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="dentist-performer">Performer #</Label>
                  <Input
                    id="dentist-performer"
                    value={draft.nhsPerformerNumber}
                    onChange={(e) => setDraft({ ...draft, nhsPerformerNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="dentist-practitioner">Practitioner ID</Label>
                  <Input
                    id="dentist-practitioner"
                    value={draft.dentallyPractitionerId}
                    onChange={(e) => setDraft({ ...draft, dentallyPractitionerId: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-(--color-text-primary)">
                  <input
                    type="checkbox"
                    checked={draft.isNhs}
                    onChange={(e) => setDraft({ ...draft, isNhs: e.target.checked })}
                    className="h-4 w-4 rounded border-(--color-border)"
                  />
                  NHS Dentist
                </label>
                {!isNew && (
                  <label className="flex items-center gap-2 text-sm text-(--color-text-primary)">
                    <input
                      type="checkbox"
                      checked={draft.active}
                      onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                      className="h-4 w-4 rounded border-(--color-border)"
                    />
                    Active
                  </label>
                )}
              </DialogBody>
              <DialogFooter>
                <Button variant="ghost" onClick={closeEdit} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={() => void save()} loading={saving}>
                  {isNew ? "Add Dentist" : "Save Changes"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open && !removing) setRemoveTarget(null);
        }}
        title="Remove dentist?"
        description={
          removeTarget
            ? `Are you sure you want to remove ${removeTarget.name}? If they already have payslips or bills, their records are kept and they are deactivated instead of being deleted.`
            : undefined
        }
        confirmLabel={removing ? "Removing..." : "Remove"}
        variant="destructive"
        onConfirm={() => void confirmRemove()}
      />
    </div>
  );
}
