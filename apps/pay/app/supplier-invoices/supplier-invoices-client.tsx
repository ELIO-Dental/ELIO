"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  Eye,
  X,
} from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  formatMoneyGBP,
  toast,
} from "@elio/ui";
import {
  buildSupplierInvoiceMatrix,
  filterSupplierInvoices,
  formatSupplierInvoiceMonthKey,
  supplierInvoiceEffectiveDate,
  summarizeSupplierInvoices,
  type SupplierInvoiceListItem,
  type SupplierPayFilter,
} from "@/lib/supplier-invoices-summary";

interface DentistOption {
  id: string;
  name: string;
}

interface SupplierOption {
  id: string;
  name: string;
}

type GroupBy = "none" | "supplier" | "dentist" | "month";
type ViewMode = "list" | "table";

const monthName = (m: number) => new Date(2000, m - 1).toLocaleString("en-GB", { month: "long" });

function dateLabel(invoice: SupplierInvoiceListItem): string {
  const d = supplierInvoiceEffectiveDate(invoice);
  return d.toISOString().slice(0, 10);
}

function invoiceMonth(invoice: SupplierInvoiceListItem): number {
  return supplierInvoiceEffectiveDate(invoice).getUTCMonth() + 1;
}

function invoiceYear(invoice: SupplierInvoiceListItem): number {
  return supplierInvoiceEffectiveDate(invoice).getUTCFullYear();
}

function mapApiInvoice(raw: {
  id: string;
  supplierId?: string | null;
  supplier?: { id: string; name: string } | null;
  dentistId?: string | null;
  dentist?: { id: string; name: string } | null;
  amountPence: number;
  description?: string | null;
  invoiceNumber?: string | null;
  fileUrl?: string | null;
  invoiceDate?: string | Date | null;
  paid: boolean;
  paidAt?: string | Date | null;
  createdAt: string | Date;
}): SupplierInvoiceListItem {
  return {
    id: raw.id,
    supplierId: raw.supplierId ?? raw.supplier?.id ?? null,
    supplierName: raw.supplier?.name ?? null,
    dentistId: raw.dentistId ?? raw.dentist?.id ?? null,
    dentistName: raw.dentist?.name ?? null,
    amountPence: raw.amountPence,
    description: raw.description ?? null,
    invoiceNumber: raw.invoiceNumber ?? null,
    fileUrl: raw.fileUrl ?? null,
    invoiceDate: raw.invoiceDate
      ? typeof raw.invoiceDate === "string"
        ? raw.invoiceDate
        : raw.invoiceDate.toISOString()
      : null,
    paid: raw.paid,
    paidAt: raw.paidAt
      ? typeof raw.paidAt === "string"
        ? raw.paidAt
        : raw.paidAt.toISOString()
      : null,
    createdAt:
      typeof raw.createdAt === "string" ? raw.createdAt : raw.createdAt.toISOString(),
  };
}

export function SupplierInvoicesClient({
  initialSupplierInvoices,
  dentists,
  suppliers: initialSuppliers,
  initialYear,
}: {
  initialSupplierInvoices: SupplierInvoiceListItem[];
  dentists: DentistOption[];
  suppliers: SupplierOption[];
  initialYear: number;
}) {
  const router = useRouter();
  const [invoices, setInvoices] = React.useState(initialSupplierInvoices);
  const [suppliers, setSuppliers] = React.useState(initialSuppliers);
  const [loading, setLoading] = React.useState(false);

  const [filterYear, setFilterYear] = React.useState(initialYear);
  const [filterMonth, setFilterMonth] = React.useState<number | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [payFilter, setPayFilter] = React.useState<SupplierPayFilter>("all");
  const [filterSupplier, setFilterSupplier] = React.useState("");
  const [filterDentist, setFilterDentist] = React.useState("");

  const [groupBy, setGroupBy] = React.useState<GroupBy>("none");
  const [viewMode, setViewMode] = React.useState<ViewMode>("list");
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());

  const [showAddRow, setShowAddRow] = React.useState(false);
  const [newInvoice, setNewInvoice] = React.useState({
    supplier_name: "",
    dentist_id: "",
    amount: "",
    description: "",
    invoice_number: "",
    date: new Date().toISOString().substring(0, 10),
  });
  const [uploading, setUploading] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [showNewSupplier, setShowNewSupplier] = React.useState(false);
  const [newSupplierName, setNewSupplierName] = React.useState("");
  const [newFile, setNewFile] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<SupplierInvoiceListItem | null>(null);
  const [removing, setRemoving] = React.useState(false);

  React.useEffect(() => {
    setInvoices(initialSupplierInvoices);
  }, [initialSupplierInvoices]);

  React.useEffect(() => {
    setSuppliers(initialSuppliers);
  }, [initialSuppliers]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(filterYear) });
      if (filterMonth) params.set("month", String(filterMonth));
      const [invRes, entitiesRes] = await Promise.all([
        fetch(`/pay/api/supplier-invoices?${params}`),
        fetch("/pay/api/saved-entities"),
      ]);
      if (invRes.ok) {
        const data = (await invRes.json()) as {
          supplierInvoices?: Array<Parameters<typeof mapApiInvoice>[0]>;
        };
        setInvoices((data.supplierInvoices ?? []).map(mapApiInvoice));
      }
      if (entitiesRes.ok) {
        const data = (await entitiesRes.json()) as { suppliers?: SupplierOption[] };
        setSuppliers(data.suppliers ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on year/month only
  }, [filterYear, filterMonth]);

  const filtered = React.useMemo(
    () =>
      filterSupplierInvoices(invoices, {
        payFilter,
        supplierName: filterSupplier || undefined,
        dentistId: filterDentist || undefined,
        search: searchTerm,
      }),
    [invoices, payFilter, filterSupplier, filterDentist, searchTerm]
  );

  const summary = React.useMemo(() => summarizeSupplierInvoices(filtered), [filtered]);
  const matrix = React.useMemo(() => buildSupplierInvoiceMatrix(filtered), [filtered]);
  const withFile = filtered.filter((i) => i.fileUrl).length;
  const filePct = filtered.length > 0 ? Math.round((withFile / filtered.length) * 100) : 0;

  const uniqueSuppliers = [
    ...new Set(invoices.map((i) => i.supplierName).filter(Boolean) as string[]),
  ].sort();
  const uniqueDentists = [
    ...new Map(
      invoices
        .filter((i) => i.dentistId)
        .map((i) => [i.dentistId!, i.dentistName] as const)
    ).entries(),
  ].sort((a, b) => (a[1] || "").localeCompare(b[1] || ""));

  const grouped = React.useMemo(() => {
    if (groupBy === "none") return null;
    const groups = new Map<string, SupplierInvoiceListItem[]>();
    for (const inv of filtered) {
      let key = "";
      if (groupBy === "supplier") key = inv.supplierName || "Unknown";
      else if (groupBy === "dentist") key = inv.dentistName || "Unassigned";
      else if (groupBy === "month") {
        key = formatSupplierInvoiceMonthKey(
          `${invoiceYear(inv)}-${String(invoiceMonth(inv)).padStart(2, "0")}`
        );
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inv);
    }
    return Array.from(groups.entries())
      .map(([key, items]) => {
        const s = summarizeSupplierInvoices(items);
        return {
          key,
          items,
          total: s.totalPence,
          unpaidTotal: s.unpaidPence,
          count: s.count,
          unpaidCount: s.unpaidCount,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [filtered, groupBy]);

  function toggleGroup(key: string) {
    const next = new Set(collapsedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsedGroups(next);
  }

  function clearFilters() {
    setSearchTerm("");
    setPayFilter("all");
    setFilterSupplier("");
    setFilterDentist("");
  }

  const hasActiveFilters =
    payFilter !== "all" || !!filterSupplier || !!filterDentist || !!searchTerm;

  async function addInvoice() {
    if (!newInvoice.supplier_name || !newInvoice.amount || !newInvoice.date) return;
    const matched = suppliers.find((s) => s.name === newInvoice.supplier_name);
    if (!matched) {
      toast.error("Select a saved supplier");
      return;
    }
    setSaving(true);
    try {
      const amountPence = Math.round(parseFloat(newInvoice.amount) * 100);
      const res = await fetch("/pay/api/supplier-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: matched.id,
          dentistId: newInvoice.dentist_id || null,
          amountPence,
          description: newInvoice.description || null,
          invoiceNumber: newInvoice.invoice_number || null,
          invoiceDate: newInvoice.date,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        supplierInvoice?: { id: string; supplierName?: string | null };
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to add invoice");

      if (newFile && data.supplierInvoice?.id) {
        const formData = new FormData();
        formData.append("file", newFile);
        formData.append("supplierInvoiceId", data.supplierInvoice.id);
        formData.append("entity_name", newInvoice.supplier_name);
        const uploadRes = await fetch("/pay/api/supplier-invoices/upload", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const uploadData = (await uploadRes.json().catch(() => ({}))) as { error?: string };
          toast.error(uploadData.error ?? "Invoice created but file upload failed");
        }
      }

      setNewInvoice({
        supplier_name: "",
        dentist_id: "",
        amount: "",
        description: "",
        invoice_number: "",
        date: new Date().toISOString().substring(0, 10),
      });
      setNewFile(null);
      setShowAddRow(false);
      toast.success("Invoice added");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add invoice");
    } finally {
      setSaving(false);
    }
  }

  async function updateInvoice(id: string, updates: Record<string, unknown>) {
    setUploading(id);
    try {
      const res = await fetch(`/pay/api/supplier-invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setUploading(null);
    }
  }

  async function uploadFile(invoiceId: string, file: File, supplierName: string) {
    setUploading(invoiceId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("supplierInvoiceId", invoiceId);
      formData.append("entity_name", supplierName);
      const res = await fetch("/pay/api/supplier-invoices/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      toast.success("File uploaded");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function addNewSupplier() {
    if (!newSupplierName.trim()) return;
    const res = await fetch("/pay/api/saved-entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "supplier", name: newSupplierName.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      entity?: { id: string; name: string };
    };
    if (!res.ok) {
      toast.error(data.error ?? "Failed to add supplier");
      return;
    }
    const name = newSupplierName.trim();
    const id = data.entity?.id;
    if (!id) {
      toast.error("Failed to add supplier");
      return;
    }
    setSuppliers((prev) => [...prev, { id, name }]);
    setNewInvoice({ ...newInvoice, supplier_name: name });
    setNewSupplierName("");
    setShowNewSupplier(false);
    toast.success("Supplier added");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setRemoving(true);
    try {
      const res = await fetch(`/pay/api/supplier-invoices/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setDeleteTarget(null);
      toast.success("Invoice deleted");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setRemoving(false);
    }
  }

  function renderInvoiceRow(inv: SupplierInvoiceListItem) {
    return (
      <tr
        key={inv.id}
        className={`hidden border-b border-(--color-border-subtle) transition last:border-0 hover:bg-(--color-bg-subtle)/50 md:table-row ${
          inv.paid ? "bg-emerald-50/30" : ""
        }`}
      >
        <td className="whitespace-nowrap px-3 py-2 text-xs text-(--color-text-tertiary)">
          {dateLabel(inv)}
        </td>
        <td className="px-3 py-2 text-sm font-medium text-(--color-text-primary)">
          {inv.supplierName ?? "—"}
        </td>
        <td className="px-3 py-2">
          <select
            value={inv.dentistId || ""}
            onChange={(e) =>
              void updateInvoice(inv.id, { dentistId: e.target.value || null })
            }
            className="w-full cursor-pointer border-0 bg-transparent p-0 text-xs text-(--color-text-secondary) outline-none hover:text-(--color-text-primary)"
          >
            <option value="">-</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2 text-xs text-(--color-text-tertiary)">
          {inv.invoiceNumber || "-"}
        </td>
        <td className="max-w-[160px] truncate px-3 py-2 text-xs text-(--color-text-tertiary)">
          {inv.description || "-"}
        </td>
        <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
          {formatMoneyGBP(inv.amountPence)}
        </td>
        <td className="px-3 py-2 text-center">
          {inv.fileUrl ? (
            <button
              type="button"
              onClick={() => setPreviewUrl(inv.fileUrl)}
              className="p-1 text-blue-600 hover:text-blue-700"
              title="View invoice"
            >
              <Eye size={16} />
            </button>
          ) : (
            <label className="cursor-pointer p-1 text-(--color-text-tertiary) transition hover:text-(--color-brand)">
              {uploading === inv.id ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Upload size={16} />
              )}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    void uploadFile(inv.id, e.target.files[0], inv.supplierName ?? "supplier");
                  }
                }}
              />
            </label>
          )}
        </td>
        <td className="px-3 py-2 text-center">
          <button
            type="button"
            onClick={() =>
              void updateInvoice(inv.id, {
                paid: !inv.paid,
                paid_date: inv.paid ? null : new Date().toISOString().substring(0, 10),
              })
            }
            className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border-2 transition ${
              inv.paid
                ? "border-green-500 bg-green-500 text-white"
                : "border-gray-300 hover:border-green-400"
            }`}
            title="Paid"
          >
            {inv.paid ? <Check size={12} /> : null}
          </button>
        </td>
        <td className="px-3 py-2 text-center">
          <button
            type="button"
            onClick={() => setDeleteTarget(inv)}
            className="p-1 text-(--color-text-tertiary) transition hover:text-(--color-danger)"
            title="Delete this invoice?"
          >
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
    );
  }

  function renderInvoiceCard(inv: SupplierInvoiceListItem) {
    return (
      <div
        key={inv.id}
        className={`border-b border-(--color-border-subtle) p-3.5 last:border-0 md:hidden ${
          inv.paid ? "bg-emerald-50/30" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{inv.supplierName}</span>
              {inv.paid && (
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                  Paid
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-(--color-text-secondary)">
              {dateLabel(inv)}
              {inv.dentistName ? ` · ${inv.dentistName}` : ""}
              {inv.invoiceNumber ? ` · #${inv.invoiceNumber}` : ""}
            </div>
            {inv.description ? (
              <div className="mt-0.5 truncate text-xs text-(--color-text-tertiary)">
                {inv.description}
              </div>
            ) : null}
          </div>
          <span className="whitespace-nowrap text-base font-bold tabular-nums">
            {formatMoneyGBP(inv.amountPence)}
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-3 border-t border-(--color-border-subtle)/50 pt-2">
          <select
            value={inv.dentistId || ""}
            onChange={(e) =>
              void updateInvoice(inv.id, { dentistId: e.target.value || null })
            }
            className="min-w-0 flex-1 rounded-lg border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1.5 text-xs"
          >
            <option value="">Assign dentist...</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            {inv.fileUrl ? (
              <button
                type="button"
                onClick={() => setPreviewUrl(inv.fileUrl)}
                className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                title="View"
              >
                <Eye size={18} />
              </button>
            ) : (
              <label className="cursor-pointer rounded-lg p-2 text-(--color-text-tertiary) transition hover:bg-(--color-bg-subtle)">
                {uploading === inv.id ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Upload size={18} />
                )}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      void uploadFile(inv.id, e.target.files[0], inv.supplierName ?? "supplier");
                    }
                  }}
                />
              </label>
            )}
            <button
              type="button"
              onClick={() =>
                void updateInvoice(inv.id, {
                  paid: !inv.paid,
                  paid_date: inv.paid ? null : new Date().toISOString().substring(0, 10),
                })
              }
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${
                inv.paid
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-gray-300 hover:border-green-400"
              }`}
            >
              {inv.paid ? <Check size={14} /> : null}
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(inv)}
              className="rounded-lg p-2 text-(--color-text-tertiary) transition hover:bg-red-50 hover:text-(--color-danger)"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderTableView() {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-(--color-border-subtle) bg-(--color-bg-subtle)">
              <th className="sticky left-0 z-10 min-w-[100px] bg-(--color-bg-subtle) px-3 py-2.5 text-left font-semibold text-(--color-text-secondary)">
                Month
              </th>
              {matrix.supplierNames.map((sn) => (
                <th
                  key={sn}
                  className="min-w-[90px] whitespace-nowrap px-3 py-2.5 text-right font-semibold text-(--color-text-secondary)"
                >
                  {sn}
                </th>
              ))}
              <th className="min-w-[90px] px-3 py-2.5 text-right font-bold text-(--color-text-primary)">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.monthKeys.map((mk) => {
              const row = matrix.lookup.get(mk);
              const rowTotal = matrix.supplierNames.reduce(
                (s, sn) => s + (row?.get(sn)?.totalPence || 0),
                0
              );
              return (
                <tr
                  key={mk}
                  className="border-b border-(--color-border-subtle) transition hover:bg-(--color-bg-subtle)/50"
                >
                  <td className="sticky left-0 z-10 bg-(--color-surface) px-3 py-2 font-medium">
                    {formatSupplierInvoiceMonthKey(mk)}
                  </td>
                  {matrix.supplierNames.map((sn) => {
                    const cell = row?.get(sn);
                    if (!cell) {
                      return (
                        <td key={sn} className="px-3 py-2 text-right text-(--color-text-tertiary)">
                          -
                        </td>
                      );
                    }
                    return (
                      <td
                        key={sn}
                        className={`px-3 py-2 text-right font-medium tabular-nums ${
                          cell.allPaid
                            ? "bg-green-50/50 text-green-700"
                            : "bg-red-50/50 text-red-700"
                        }`}
                      >
                        {formatMoneyGBP(cell.totalPence)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {formatMoneyGBP(rowTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-(--color-border-subtle) bg-(--color-bg-subtle)">
              <td className="sticky left-0 z-10 bg-(--color-bg-subtle) px-3 py-2.5 font-bold">
                Total
              </td>
              {matrix.supplierNames.map((sn) => (
                <td key={sn} className="px-3 py-2.5 text-right font-bold tabular-nums">
                  {formatMoneyGBP(matrix.columnTotals.get(sn) || 0)}
                </td>
              ))}
              <td className="px-3 py-2.5 text-right font-bold tabular-nums text-(--color-brand)">
                {formatMoneyGBP(summary.totalPence)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  const selectCls =
    "rounded-lg border border-(--color-border-subtle) bg-(--color-surface) px-2.5 py-2 text-xs sm:py-1.5";

  return (
    <div className="space-y-4 sm:space-y-5" data-testid="supplier-invoices-page">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-h2 text-(--color-text-primary)">Supplier Invoices</h1>
          <p className="mt-0.5 text-body-sm text-(--color-text-secondary)">
            Track and manage supplier invoices
          </p>
        </div>
        <Button onClick={() => setShowAddRow(true)} className="w-full sm:w-auto">
          <Plus className="mr-1.5 h-4 w-4" />
          Add Invoice
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setPayFilter("all")}
          className={`rounded-xl border p-3.5 text-left transition ${
            payFilter === "all"
              ? "border-(--color-brand) bg-(--color-brand-subtle) ring-1 ring-(--color-brand)/30"
              : "border-(--color-border-subtle) bg-(--color-surface) hover:border-(--color-brand)/40"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-text-tertiary)">
            Total
          </p>
          <p className="mt-0.5 text-xl font-bold tabular-nums">
            {formatMoneyGBP(summary.totalPence)}
          </p>
          <p className="mt-0.5 text-[10px] text-(--color-text-tertiary)">
            {summary.count} invoices
          </p>
        </button>
        <button
          type="button"
          onClick={() => setPayFilter("paid")}
          className={`rounded-xl border p-3.5 text-left transition ${
            payFilter === "paid"
              ? "border-green-300 bg-green-50 ring-1 ring-green-200"
              : "border-(--color-border-subtle) bg-(--color-surface) hover:border-green-200"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-green-600">Paid</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-green-600">
            {formatMoneyGBP(summary.paidPence)}
          </p>
          <p className="mt-0.5 text-[10px] text-(--color-text-tertiary)">
            {filtered.filter((i) => i.paid).length} invoices
          </p>
        </button>
        <button
          type="button"
          onClick={() => setPayFilter("unpaid")}
          className={`rounded-xl border p-3.5 text-left transition ${
            payFilter === "unpaid"
              ? "border-red-300 bg-red-50 ring-1 ring-red-200"
              : "border-(--color-border-subtle) bg-(--color-surface) hover:border-red-200"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600">Unpaid</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums text-red-600">
            {formatMoneyGBP(summary.unpaidPence)}
          </p>
          <p className="mt-0.5 text-[10px] text-(--color-text-tertiary)">
            {summary.unpaidCount} invoices
          </p>
        </button>
        <div className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-text-tertiary)">
            With File
          </p>
          <p className="mt-0.5 text-xl font-bold">
            {withFile}
            <span className="text-sm font-normal text-(--color-text-secondary)">
              /{filtered.length}
            </span>
          </p>
          <p className="mt-0.5 text-[10px] text-(--color-text-tertiary)">{filePct}% uploaded</p>
        </div>
      </div>

      <div className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) p-3">
        <div className="relative mb-2 sm:hidden">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-tertiary)"
          />
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-(--color-border-subtle) bg-(--color-bg-subtle)/50 py-2 pl-9 pr-3 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(parseInt(e.target.value, 10))}
            className={`${selectCls} font-medium`}
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            value={filterMonth || ""}
            onChange={(e) =>
              setFilterMonth(e.target.value ? parseInt(e.target.value, 10) : null)
            }
            className={`${selectCls} flex-1 sm:flex-none`}
          >
            <option value="">All Months</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {monthName(i + 1)}
              </option>
            ))}
          </select>
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className={`${selectCls} flex-1 sm:flex-none`}
          >
            <option value="">All Suppliers</option>
            {uniqueSuppliers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={filterDentist}
            onChange={(e) => setFilterDentist(e.target.value)}
            className={`${selectCls} flex-1 sm:flex-none`}
          >
            <option value="">All Dentists</option>
            {uniqueDentists.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-2 py-1.5 text-xs font-medium text-(--color-brand) hover:opacity-80"
            >
              Clear
            </button>
          )}

          <div className="relative hidden min-w-[120px] flex-1 sm:block">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--color-text-tertiary)"
            />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-(--color-border-subtle) bg-(--color-surface) py-1.5 pl-8 pr-3 text-xs"
            />
          </div>

          <div className="mx-1 hidden h-5 w-px bg-(--color-border-subtle) sm:block" />

          <div className="hidden items-center gap-1 sm:flex">
            <span className="text-[10px] font-medium uppercase text-(--color-text-tertiary)">
              Group:
            </span>
            {(["none", "supplier", "dentist", "month"] as GroupBy[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${
                  groupBy === g
                    ? "bg-(--color-brand-subtle) text-(--color-brand)"
                    : "text-(--color-text-tertiary) hover:bg-(--color-bg-subtle)"
                }`}
              >
                {g === "none" ? "None" : g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>

          <div className="mx-1 hidden h-5 w-px bg-(--color-border-subtle) sm:block" />

          <div className="flex items-center rounded-lg bg-(--color-bg-subtle) p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-md p-1.5 transition ${
                viewMode === "list"
                  ? "bg-(--color-surface) text-(--color-text-primary) shadow-sm"
                  : "text-(--color-text-tertiary)"
              }`}
              title="List view"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`rounded-md p-1.5 transition ${
                viewMode === "table"
                  ? "bg-(--color-surface) text-(--color-text-primary) shadow-sm"
                  : "text-(--color-text-tertiary)"
              }`}
              title="Table view"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1 overflow-x-auto sm:hidden">
          <span className="shrink-0 text-[10px] font-medium uppercase text-(--color-text-tertiary)">
            Group:
          </span>
          {(["none", "supplier", "dentist", "month"] as GroupBy[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupBy(g)}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition ${
                groupBy === g
                  ? "bg-(--color-brand-subtle) text-(--color-brand)"
                  : "text-(--color-text-tertiary) hover:bg-(--color-bg-subtle)"
              }`}
            >
              {g === "none" ? "None" : g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-(--color-border-subtle) bg-(--color-surface)">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-(--color-brand)" />
          </div>
        ) : viewMode === "table" ? (
          renderTableView()
        ) : grouped ? (
          <div>
            {grouped.map((group) => (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between border-b border-(--color-border-subtle) bg-(--color-bg-subtle) px-4 py-2.5 transition hover:opacity-90"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {collapsedGroups.has(group.key) ? (
                      <ChevronRight size={14} className="shrink-0 text-(--color-text-tertiary)" />
                    ) : (
                      <ChevronDown size={14} className="shrink-0 text-(--color-text-tertiary)" />
                    )}
                    <span className="truncate text-sm font-semibold">{group.key}</span>
                    <span className="shrink-0 text-xs text-(--color-text-secondary)">
                      ({group.count})
                    </span>
                    {group.unpaidCount > 0 && (
                      <span className="hidden shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 sm:inline">
                        {group.unpaidCount} unpaid
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs sm:gap-4">
                    {group.unpaidTotal > 0 && (
                      <span className="hidden font-semibold text-red-600 sm:inline">
                        {formatMoneyGBP(group.unpaidTotal)}
                      </span>
                    )}
                    <span className="font-bold tabular-nums">{formatMoneyGBP(group.total)}</span>
                  </div>
                </button>
                {!collapsedGroups.has(group.key) && (
                  <>
                    <table className="hidden w-full text-sm md:table">
                      <tbody>{group.items.map(renderInvoiceRow)}</tbody>
                    </table>
                    <div className="md:hidden">{group.items.map(renderInvoiceCard)}</div>
                  </>
                )}
              </div>
            ))}
            {grouped.length === 0 && (
              <p className="py-8 text-center text-sm text-(--color-text-secondary)">
                No invoices match your filters
              </p>
            )}
            {grouped.length > 0 && (
              <div className="flex items-center justify-between border-t-2 border-(--color-border-subtle) bg-(--color-bg-subtle) px-4 py-3">
                <span className="text-xs font-bold sm:text-sm">
                  Grand Total ({filtered.length})
                </span>
                <div className="flex items-center gap-2 text-sm sm:gap-4">
                  {summary.unpaidPence > 0 && (
                    <span className="text-xs font-semibold text-red-600 sm:text-sm">
                      {formatMoneyGBP(summary.unpaidPence)}
                    </span>
                  )}
                  <span className="font-bold tabular-nums text-(--color-brand)">
                    {formatMoneyGBP(summary.totalPence)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {showAddRow && (
              <div className="space-y-3 border-b border-(--color-border-subtle) bg-(--color-brand-subtle)/60 p-4 md:hidden">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={newInvoice.date}
                    onChange={(e) => setNewInvoice({ ...newInvoice, date: e.target.value })}
                    className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={newInvoice.amount}
                    onChange={(e) => setNewInvoice({ ...newInvoice, amount: e.target.value })}
                    className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-right text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={newInvoice.supplier_name}
                    onChange={(e) =>
                      setNewInvoice({ ...newInvoice, supplier_name: e.target.value })
                    }
                    className="flex-1 rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-sm"
                  >
                    <option value="">Select supplier...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewSupplier(true)}
                    className="shrink-0 p-2 text-(--color-brand)"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                {showNewSupplier && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="New supplier name"
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      className="flex-1 rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void addNewSupplier()}
                      className="p-2 text-green-600"
                    >
                      <Check size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewSupplier(false);
                        setNewSupplierName("");
                      }}
                      className="p-2 text-(--color-text-tertiary)"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                <select
                  value={newInvoice.dentist_id}
                  onChange={(e) =>
                    setNewInvoice({ ...newInvoice, dentist_id: e.target.value })
                  }
                  className="w-full rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-sm"
                >
                  <option value="">Assign dentist...</option>
                  {dentists.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Invoice #"
                    value={newInvoice.invoice_number}
                    onChange={(e) =>
                      setNewInvoice({ ...newInvoice, invoice_number: e.target.value })
                    }
                    className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={newInvoice.description}
                    onChange={(e) =>
                      setNewInvoice({ ...newInvoice, description: e.target.value })
                    }
                    className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-sm"
                  />
                </div>
                <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-(--color-brand)/30 bg-(--color-brand-subtle) px-3 py-2.5 text-sm font-medium text-(--color-brand)">
                  <Upload size={16} />
                  {newFile ? newFile.name.substring(0, 20) : "Attach photo or file"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setNewFile(e.target.files[0]);
                    }}
                  />
                </label>
                <div className="flex items-center gap-2">
                  <Button className="flex-1" loading={saving} onClick={() => void addInvoice()}>
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowAddRow(false);
                      setNewFile(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--color-border-subtle) bg-(--color-bg-subtle)">
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-(--color-text-secondary)">
                      Date
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-(--color-text-secondary)">
                      Supplier
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-(--color-text-secondary)">
                      Dentist
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-(--color-text-secondary)">
                      Inv #
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-(--color-text-secondary)">
                      Description
                    </th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-(--color-text-secondary)">
                      Amount
                    </th>
                    <th className="w-12 px-3 py-2.5 text-center text-xs font-medium text-(--color-text-secondary)">
                      File
                    </th>
                    <th className="w-10 px-3 py-2.5 text-center text-xs font-medium text-(--color-text-secondary)">
                      Paid
                    </th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {showAddRow && (
                    <tr className="border-b border-(--color-border-subtle) bg-(--color-brand-subtle)/60">
                      <td className="px-3 py-1.5">
                        <input
                          type="date"
                          value={newInvoice.date}
                          onChange={(e) =>
                            setNewInvoice({ ...newInvoice, date: e.target.value })
                          }
                          className="w-full rounded border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <select
                            value={newInvoice.supplier_name}
                            onChange={(e) =>
                              setNewInvoice({ ...newInvoice, supplier_name: e.target.value })
                            }
                            className="flex-1 rounded border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1 text-xs"
                          >
                            <option value="">Supplier...</option>
                            {suppliers.map((s) => (
                              <option key={s.id} value={s.name}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowNewSupplier(true)}
                            className="shrink-0 text-(--color-brand)"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        {showNewSupplier && (
                          <div className="mt-1 flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="New supplier"
                              value={newSupplierName}
                              onChange={(e) => setNewSupplierName(e.target.value)}
                              className="flex-1 rounded border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1 text-[10px]"
                            />
                            <button
                              type="button"
                              onClick={() => void addNewSupplier()}
                              className="text-green-600"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowNewSupplier(false);
                                setNewSupplierName("");
                              }}
                              className="text-(--color-text-tertiary)"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={newInvoice.dentist_id}
                          onChange={(e) =>
                            setNewInvoice({ ...newInvoice, dentist_id: e.target.value })
                          }
                          className="w-full rounded border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1 text-xs"
                        >
                          <option value="">Dentist...</option>
                          {dentists.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          placeholder="INV-001"
                          value={newInvoice.invoice_number}
                          onChange={(e) =>
                            setNewInvoice({ ...newInvoice, invoice_number: e.target.value })
                          }
                          className="w-full rounded border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          placeholder="Description"
                          value={newInvoice.description}
                          onChange={(e) =>
                            setNewInvoice({ ...newInvoice, description: e.target.value })
                          }
                          className="w-full rounded border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={newInvoice.amount}
                          onChange={(e) =>
                            setNewInvoice({ ...newInvoice, amount: e.target.value })
                          }
                          className="w-20 rounded border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1 text-right text-xs"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <label className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-(--color-brand)">
                          <Upload size={12} />
                          {newFile ? "..." : ""}
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files?.[0]) setNewFile(e.target.files[0]);
                            }}
                          />
                        </label>
                      </td>
                      <td className="px-3 py-1.5 text-center text-(--color-text-tertiary)">-</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => void addInvoice()}
                            disabled={saving}
                            className="text-green-600 hover:text-green-700"
                          >
                            {saving ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Check size={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddRow(false);
                              setNewFile(null);
                            }}
                            className="text-(--color-text-tertiary) hover:text-(--color-text-primary)"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filtered.map(renderInvoiceRow)}
                  {filtered.length === 0 && !showAddRow && (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-8 text-center text-sm text-(--color-text-secondary)"
                      >
                        No invoices match your filters
                      </td>
                    </tr>
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-(--color-border-subtle) bg-(--color-bg-subtle)">
                      <td colSpan={5} className="px-3 py-2.5 text-xs font-bold">
                        Total ({filtered.length} invoices)
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums">
                        {formatMoneyGBP(summary.totalPence)}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="md:hidden">
              {filtered.map(renderInvoiceCard)}
              {filtered.length === 0 && !showAddRow && (
                <p className="py-8 text-center text-sm text-(--color-text-secondary)">
                  No invoices match your filters
                </p>
              )}
              {filtered.length > 0 && (
                <div className="flex items-center justify-between border-t-2 border-(--color-border-subtle) bg-(--color-bg-subtle) px-4 py-3">
                  <span className="text-xs font-bold">{filtered.length} invoices</span>
                  <span className="text-sm font-bold tabular-nums">
                    {formatMoneyGBP(summary.totalPence)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Invoice Preview</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto p-2 sm:p-4" style={{ maxHeight: "80vh" }}>
            {previewUrl?.toLowerCase().includes(".pdf") ? (
              <iframe
                src={previewUrl}
                className="h-[60vh] w-full rounded-lg border sm:h-[70vh]"
                title="Invoice Preview"
              />
            ) : previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Invoice" className="mx-auto max-w-full rounded-lg" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !removing) setDeleteTarget(null);
        }}
        title="Delete this invoice?"
        description="This cannot be undone."
        confirmLabel={removing ? "Deleting..." : "Delete"}
        variant="destructive"
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
