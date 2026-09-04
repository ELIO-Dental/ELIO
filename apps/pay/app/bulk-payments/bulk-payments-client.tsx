"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
  TablePanel,
  TableCellMoney,
  formatMoneyGBP,
  TableToolbar,
  TablePagination,
  useClientTablePagination,
  Skeleton,
  TableRefreshButton,
  toast,
  ConfirmDialog,
} from "@elio/ui";
import { Building2, Check, Download, Pencil, Plus, Trash2, X } from "lucide-react";
import { aggregateStarlingPayments, type UnpaidBillRow } from "@/lib/bulk-payment";

interface SavedEntity {
  id: string;
  name: string;
  accountName: string | null;
  sortCode: string | null;
  accountNumber: string | null;
}

interface EntityForm {
  name: string;
  account_name: string;
  sort_code: string;
  account_number: string;
}

const emptyForm = (): EntityForm => ({ name: "", account_name: "", sort_code: "", account_number: "" });

export function BulkPaymentsClient() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<"bank_details" | "unpaid">("bank_details");
  const [labs, setLabs] = React.useState<SavedEntity[]>([]);
  const [suppliers, setSuppliers] = React.useState<SavedEntity[]>([]);
  const [unpaidLabBills, setUnpaidLabBills] = React.useState<UnpaidBillRow[]>([]);
  const [unpaidSupplierInvoices, setUnpaidSupplierInvoices] = React.useState<UnpaidBillRow[]>([]);
  const [selectedLab, setSelectedLab] = React.useState<Set<string>>(new Set());
  const [selectedSupplier, setSelectedSupplier] = React.useState<Set<string>>(new Set());
  const [editingEntity, setEditingEntity] = React.useState<{ type: "lab" | "supplier"; id: string } | null>(null);
  const [editForm, setEditForm] = React.useState<EntityForm>(emptyForm());
  const [showAddEntity, setShowAddEntity] = React.useState<"lab" | "supplier" | null>(null);
  const [newEntity, setNewEntity] = React.useState<EntityForm>(emptyForm());
  const [marking, setMarking] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [savingEntity, setSavingEntity] = React.useState(false);
  const [addingEntity, setAddingEntity] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<{ type: "lab" | "supplier"; id: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const hasLoadedOnce = React.useRef(false);

  const load = React.useCallback(async (opts?: { soft?: boolean }) => {
    const soft = Boolean(opts?.soft) && hasLoadedOnce.current;
    if (!soft) setLoading(true);
    setError(null);
    try {
      const [entitiesRes, unpaidRes] = await Promise.all([
        fetch("/pay/api/saved-entities"),
        fetch("/pay/api/bulk-payment"),
      ]);
      if (entitiesRes.ok) {
        const data = await entitiesRes.json();
        setLabs(data.labs ?? []);
        setSuppliers(data.suppliers ?? []);
      }
      if (unpaidRes.ok) {
        const data = await unpaidRes.json();
        setUnpaidLabBills(data.lab_bills ?? []);
        setUnpaidSupplierInvoices(data.supplier_invoices ?? []);
      }
      hasLoadedOnce.current = true;
    } catch {
      setError("Failed to load bulk payment data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function saveEntity(type: "lab" | "supplier", id: string) {
    setSavingEntity(true);
    try {
      const res = await fetch("/pay/api/saved-entities", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, ...editForm }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save");
        return;
      }
      setEditingEntity(null);
      toast.success("Saved");
      await load({ soft: true });
      router.refresh();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingEntity(false);
    }
  }

  async function addEntity(type: "lab" | "supplier") {
    if (!newEntity.name.trim()) return;
    setAddingEntity(true);
    try {
      const res = await fetch("/pay/api/saved-entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...newEntity }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to add");
        return;
      }
      setNewEntity(emptyForm());
      setShowAddEntity(null);
      toast.success(type === "lab" ? "Lab added" : "Supplier added");
      await load({ soft: true });
      router.refresh();
    } catch {
      toast.error("Failed to add");
    } finally {
      setAddingEntity(false);
    }
  }

  async function deleteEntity(type: "lab" | "supplier", id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/pay/api/saved-entities?type=${type}&id=${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete");
        return;
      }
      toast.success("Deleted");
      await load({ soft: true });
      router.refresh();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  async function markPaid(type: "lab" | "supplier", ids: string[]) {
    if (ids.length === 0) return;
    setMarking(true);
    try {
      const res = await fetch("/pay/api/bulk-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_paid", type, ids }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to mark paid");
        return;
      }
      if (type === "lab") setSelectedLab(new Set());
      else setSelectedSupplier(new Set());
      toast.success("Marked as paid");
      await load({ soft: true });
      router.refresh();
    } catch {
      toast.error("Failed to mark paid");
    } finally {
      setMarking(false);
    }
  }

  async function generateCsv() {
    const selectedBills = [
      ...unpaidLabBills.filter((b) => selectedLab.has(b.id)),
      ...unpaidSupplierInvoices.filter((b) => selectedSupplier.has(b.id)),
    ];
    if (selectedBills.length === 0) {
      toast.error("Please select bills to include in the bulk payment.");
      return;
    }

    setExporting(true);
    try {
      const payments = aggregateStarlingPayments(selectedBills);
      const res = await fetch("/pay/api/bulk-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_csv", payments }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Failed to generate CSV");
        return;
      }
      const data = await res.json();
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bulk-payment-${new Date().toISOString().substring(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch {
      toast.error("Failed to generate CSV");
    } finally {
      setExporting(false);
    }
  }

  function toggleSelection(type: "lab" | "supplier", id: string) {
    if (type === "lab") {
      setSelectedLab((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setSelectedSupplier((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  }

  function selectAll(type: "lab" | "supplier") {
    if (type === "lab") {
      setSelectedLab((prev) =>
        prev.size === unpaidLabBills.length ? new Set() : new Set(unpaidLabBills.map((b) => b.id))
      );
    } else {
      setSelectedSupplier((prev) =>
        prev.size === unpaidSupplierInvoices.length
          ? new Set()
          : new Set(unpaidSupplierInvoices.map((b) => b.id))
      );
    }
  }

  function startEdit(type: "lab" | "supplier", entity: SavedEntity) {
    setEditingEntity({ type, id: entity.id });
    setEditForm({
      name: entity.name,
      account_name: entity.accountName ?? "",
      sort_code: entity.sortCode ?? "",
      account_number: entity.accountNumber ?? "",
    });
  }

  function renderEntityTable(type: "lab" | "supplier", entities: SavedEntity[]) {
    const label = type === "lab" ? "Labs" : "Suppliers";
    return (
      <TablePanel
        toolbar={
          <TableToolbar title={`${label} bank details`} onRefresh={() => void load({ soft: true })}>
            <Button size="sm" variant="outline" onClick={() => setShowAddEntity(type)}>
              <Plus className="mr-1 h-4 w-4" />
              Add {type === "lab" ? "lab" : "supplier"}
            </Button>
          </TableToolbar>
        }
      >
        {entities.length === 0 && showAddEntity !== type ? (
          <EmptyState title={`No ${label.toLowerCase()} yet`} description="Add bank details for bulk payments." className="py-8" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Account name</TableHead>
                <TableHead>Sort code</TableHead>
                <TableHead>Account number</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {showAddEntity === type && (
                <TableRow>
                  <TableCell>
                    <Input placeholder="Name" value={newEntity.name} onChange={(e) => setNewEntity({ ...newEntity, name: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input placeholder="Account name" value={newEntity.account_name} onChange={(e) => setNewEntity({ ...newEntity, account_name: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input placeholder="00-00-00" value={newEntity.sort_code} onChange={(e) => setNewEntity({ ...newEntity, sort_code: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input placeholder="12345678" value={newEntity.account_number} onChange={(e) => setNewEntity({ ...newEntity, account_number: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => addEntity(type)} loading={addingEntity} aria-label="Save">
                        <Check className="h-4 w-4 text-(--color-success)" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowAddEntity(null)} aria-label="Cancel">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {entities.map((entity) => {
                const isEditing = editingEntity?.type === type && editingEntity.id === entity.id;
                return (
                  <TableRow key={entity.id}>
                    <TableCell>
                      {isEditing ? (
                        <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                      ) : (
                        entity.name
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input value={editForm.account_name} onChange={(e) => setEditForm({ ...editForm, account_name: e.target.value })} />
                      ) : (
                        entity.accountName || "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {isEditing ? (
                        <Input value={editForm.sort_code} onChange={(e) => setEditForm({ ...editForm, sort_code: e.target.value })} />
                      ) : (
                        entity.sortCode || "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {isEditing ? (
                        <Input value={editForm.account_number} onChange={(e) => setEditForm({ ...editForm, account_number: e.target.value })} />
                      ) : (
                        entity.accountNumber || "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => saveEntity(type, entity.id)} loading={savingEntity} aria-label="Save">
                            <Check className="h-4 w-4 text-(--color-success)" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingEntity(null)} aria-label="Cancel">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(type, entity)} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget({ type, id: entity.id })}
                            loading={deletingId === entity.id}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-(--color-danger)" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TablePanel>
    );
  }

  function renderUnpaidTable(type: "lab" | "supplier", bills: UnpaidBillRow[], selected: Set<string>) {
    return (
      <UnpaidBillsTable
        type={type}
        bills={bills}
        selected={selected}
        marking={marking}
        onToggle={(id) => toggleSelection(type, id)}
        onSelectAll={() => selectAll(type)}
        onMarkPaid={(ids) => markPaid(type, ids)}
      />
    );
  }

  const unpaidCount = unpaidLabBills.length + unpaidSupplierInvoices.length;
  const hasSelection = selectedLab.size > 0 || selectedSupplier.size > 0;

  return (
    <div className="space-y-6" data-testid="bulk-payments-page">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg bg-(--color-bg-subtle) p-1">
          <button
            type="button"
            onClick={() => setActiveTab("bank_details")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === "bank_details"
                ? "bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-sm)"
                : "text-(--color-text-secondary)"
            }`}
          >
            <Building2 className="h-4 w-4" />
            Bank details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("unpaid")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === "unpaid"
                ? "bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-sm)"
                : "text-(--color-text-secondary)"
            }`}
          >
            <Download className="h-4 w-4" />
            Unpaid bills
            {unpaidCount > 0 && (
              <span className="rounded-full bg-(--color-danger)/15 px-1.5 py-0.5 text-xs font-semibold text-(--color-danger)">
                {unpaidCount}
              </span>
            )}
          </button>
        </div>

        {activeTab === "unpaid" && hasSelection && (
          <Button onClick={() => void generateCsv()} loading={exporting} data-testid="bulk-export-starling-csv">
            <Download className="mr-2 h-4 w-4" />
            Export Starling CSV
          </Button>
        )}
        <TableRefreshButton onRefresh={() => void load({ soft: true })} aria-label="Refresh bulk payments" />
      </div>

      {error && <p className="text-sm text-(--color-danger)">{error}</p>}

      {loading ? (
        <div className="space-y-4" aria-busy aria-label="Loading bulk payments">
          <Skeleton className="h-10 w-full rounded-(--radius-lg)" />
          <Skeleton className="h-48 w-full rounded-(--radius-lg)" />
          <Skeleton className="h-48 w-full rounded-(--radius-lg)" />
        </div>
      ) : activeTab === "bank_details" ? (
        <div className="space-y-6">
          {renderEntityTable("lab", labs)}
          {renderEntityTable("supplier", suppliers)}
        </div>
      ) : (
        <div className="space-y-6">
          {renderUnpaidTable("lab", unpaidLabBills, selectedLab)}
          {renderUnpaidTable("supplier", unpaidSupplierInvoices, selectedSupplier)}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete this ${deleteTarget?.type ?? "entity"}?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteEntity(deleteTarget.type, deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function UnpaidBillsTable({
  type,
  bills,
  selected,
  marking,
  onToggle,
  onSelectAll,
  onMarkPaid,
}: {
  type: "lab" | "supplier";
  bills: UnpaidBillRow[];
  selected: Set<string>;
  marking: boolean;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onMarkPaid: (ids: string[]) => void;
}) {
  const {
    items: pageBills,
    page,
    pageSize,
    totalCount,
    setPage,
    showPagination,
  } = useClientTablePagination(bills, 25, [type, bills.length]);

  const totalPence = bills.reduce((sum, bill) => sum + bill.amountPence, 0);
  const selectedTotalPence = bills
    .filter((bill) => selected.has(bill.id))
    .reduce((sum, bill) => sum + bill.amountPence, 0);
  const label = type === "lab" ? "Lab bills" : "Supplier invoices";

  return (
    <TablePanel
      toolbar={
        <TableToolbar title={`Unpaid ${label.toLowerCase()}`}>
          <p className="text-body-sm text-(--color-text-secondary)">
            {bills.length} unpaid totalling {formatMoneyGBP(totalPence)}
            {selected.size > 0 && ` — ${selected.size} selected: ${formatMoneyGBP(selectedTotalPence)}`}
          </p>
          {selected.size > 0 && (
            <Button size="sm" onClick={() => onMarkPaid(Array.from(selected))} loading={marking}>
              <Check className="mr-1 h-4 w-4" />
              Mark {selected.size} paid
            </Button>
          )}
        </TableToolbar>
      }
      footer={
        showPagination ? (
          <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} />
        ) : undefined
      }
    >
      {bills.length === 0 ? (
        <EmptyState title={`All ${label.toLowerCase()} are paid`} className="py-8" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={selected.size === bills.length && bills.length > 0}
                  onChange={onSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Bank details</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageBills.map((bill) => (
              <TableRow key={bill.id} className={selected.has(bill.id) ? "bg-(--color-bg-subtle)" : undefined}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(bill.id)}
                    onChange={() => onToggle(bill.id)}
                    aria-label={`Select ${bill.entity_name}`}
                  />
                </TableCell>
                <TableCell>{bill.entity_name}</TableCell>
                <TableCell>{bill.date}</TableCell>
                <TableCell className="max-w-[200px] truncate">{bill.description ?? "—"}</TableCell>
                <TableCell>
                  {bill.sort_code && bill.account_number ? (
                    <span className="font-mono text-xs">
                      {bill.sort_code} / {bill.account_number}
                    </span>
                  ) : (
                    <span className="text-xs text-(--color-warning)">No bank details</span>
                  )}
                </TableCell>
                <TableCellMoney>{formatMoneyGBP(bill.amountPence)}</TableCellMoney>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </TablePanel>
  );
}
