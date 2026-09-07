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
  buildLabBillMatrix,
  filterLabBills,
  formatLabBillMonthKey,
  labBillEffectiveDate,
  summarizeLabBills,
  type LabBillListItem,
  type LabPayFilter,
} from "@/lib/lab-bills-summary";

interface DentistOption {
  id: string;
  name: string;
}

interface SavedLabOption {
  id: string;
  name: string;
}

type GroupBy = "none" | "lab" | "dentist" | "month";
type ViewMode = "list" | "table";

const monthName = (m: number) => new Date(2000, m - 1).toLocaleString("en-GB", { month: "long" });

function dateLabel(bill: LabBillListItem): string {
  const d = labBillEffectiveDate(bill);
  return d.toISOString().slice(0, 10);
}

function billMonth(bill: LabBillListItem): number {
  return labBillEffectiveDate(bill).getUTCMonth() + 1;
}

function billYear(bill: LabBillListItem): number {
  return labBillEffectiveDate(bill).getUTCFullYear();
}

function mapApiBill(raw: {
  id: string;
  labName?: string | null;
  dentistId?: string | null;
  dentist?: { id: string; name: string } | null;
  savedLab?: { id: string; name: string } | null;
  amountPence: number;
  description?: string | null;
  fileUrl?: string | null;
  billDate?: string | Date | null;
  paid: boolean;
  paidAt?: string | Date | null;
  createdAt: string | Date;
}): LabBillListItem {
  return {
    id: raw.id,
    labName: raw.labName ?? raw.savedLab?.name ?? null,
    dentistId: raw.dentistId ?? raw.dentist?.id ?? null,
    dentistName: raw.dentist?.name ?? null,
    amountPence: raw.amountPence,
    description: raw.description ?? null,
    fileUrl: raw.fileUrl ?? null,
    billDate: raw.billDate
      ? typeof raw.billDate === "string"
        ? raw.billDate
        : raw.billDate.toISOString()
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

export function LabBillsClient({
  initialLabBills,
  dentists,
  savedLabs: initialSavedLabs,
  initialYear,
}: {
  initialLabBills: LabBillListItem[];
  dentists: DentistOption[];
  savedLabs: SavedLabOption[];
  initialYear: number;
}) {
  const router = useRouter();
  const [bills, setBills] = React.useState(initialLabBills);
  const [savedLabs, setSavedLabs] = React.useState(initialSavedLabs);
  const [loading, setLoading] = React.useState(false);

  const [filterYear, setFilterYear] = React.useState(initialYear);
  const [filterMonth, setFilterMonth] = React.useState<number | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [payFilter, setPayFilter] = React.useState<LabPayFilter>("all");
  const [filterLab, setFilterLab] = React.useState("");
  const [filterDentist, setFilterDentist] = React.useState("");

  const [groupBy, setGroupBy] = React.useState<GroupBy>("none");
  const [viewMode, setViewMode] = React.useState<ViewMode>("list");
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());

  const [showAddRow, setShowAddRow] = React.useState(false);
  const [newBill, setNewBill] = React.useState({
    lab_name: "",
    dentist_id: "",
    amount: "",
    description: "",
    date: new Date().toISOString().substring(0, 10),
  });
  const [uploading, setUploading] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [showNewLab, setShowNewLab] = React.useState(false);
  const [newLabName, setNewLabName] = React.useState("");
  const [newFile, setNewFile] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<LabBillListItem | null>(null);
  const [removing, setRemoving] = React.useState(false);

  React.useEffect(() => {
    setBills(initialLabBills);
  }, [initialLabBills]);

  React.useEffect(() => {
    setSavedLabs(initialSavedLabs);
  }, [initialSavedLabs]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(filterYear) });
      if (filterMonth) params.set("month", String(filterMonth));
      const [billsRes, entitiesRes] = await Promise.all([
        fetch(`/pay/api/lab-bills?${params}`),
        fetch("/pay/api/saved-entities"),
      ]);
      if (billsRes.ok) {
        const data = (await billsRes.json()) as { labBills?: Array<Parameters<typeof mapApiBill>[0]> };
        setBills((data.labBills ?? []).map(mapApiBill));
      }
      if (entitiesRes.ok) {
        const data = (await entitiesRes.json()) as { labs?: SavedLabOption[] };
        setSavedLabs(data.labs ?? []);
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
      filterLabBills(bills, {
        payFilter,
        labName: filterLab || undefined,
        dentistId: filterDentist || undefined,
        search: searchTerm,
      }),
    [bills, payFilter, filterLab, filterDentist, searchTerm]
  );

  const summary = React.useMemo(() => summarizeLabBills(filtered), [filtered]);
  const matrix = React.useMemo(() => buildLabBillMatrix(filtered), [filtered]);
  const withInvoice = filtered.filter((b) => b.fileUrl).length;
  const invoicePct = filtered.length > 0 ? Math.round((withInvoice / filtered.length) * 100) : 0;

  const uniqueLabs = [...new Set(bills.map((b) => b.labName).filter(Boolean) as string[])].sort();
  const uniqueDentists = [
    ...new Map(
      bills
        .filter((b) => b.dentistId)
        .map((b) => [b.dentistId!, b.dentistName] as const)
    ).entries(),
  ].sort((a, b) => (a[1] || "").localeCompare(b[1] || ""));

  const grouped = React.useMemo(() => {
    if (groupBy === "none") return null;
    const groups = new Map<string, LabBillListItem[]>();
    for (const bill of filtered) {
      let key = "";
      if (groupBy === "lab") key = bill.labName || "Unknown";
      else if (groupBy === "dentist") key = bill.dentistName || "Unassigned";
      else if (groupBy === "month") {
        key = formatLabBillMonthKey(
          `${billYear(bill)}-${String(billMonth(bill)).padStart(2, "0")}`
        );
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(bill);
    }
    return Array.from(groups.entries())
      .map(([key, items]) => {
        const s = summarizeLabBills(items);
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
    setFilterLab("");
    setFilterDentist("");
  }

  const hasActiveFilters = payFilter !== "all" || !!filterLab || !!filterDentist || !!searchTerm;

  async function addBill() {
    if (!newBill.lab_name || !newBill.amount || !newBill.date) return;
    setSaving(true);
    try {
      const amountPence = Math.round(parseFloat(newBill.amount) * 100);
      const matched = savedLabs.find((l) => l.name === newBill.lab_name);
      const res = await fetch("/pay/api/lab-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labName: newBill.lab_name,
          savedLabId: matched?.id ?? null,
          dentistId: newBill.dentist_id || null,
          amountPence,
          description: newBill.description || null,
          billDate: newBill.date,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        labBill?: { id: string; labName?: string | null };
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to add lab bill");

      if (newFile && data.labBill?.id) {
        const formData = new FormData();
        formData.append("file", newFile);
        formData.append("labBillId", data.labBill.id);
        formData.append("entity_name", data.labBill.labName ?? newBill.lab_name);
        const uploadRes = await fetch("/pay/api/lab-bills/upload", {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const uploadData = (await uploadRes.json().catch(() => ({}))) as { error?: string };
          toast.error(uploadData.error ?? "Lab bill created but file upload failed");
        }
      }

      setNewBill({
        lab_name: "",
        dentist_id: "",
        amount: "",
        description: "",
        date: new Date().toISOString().substring(0, 10),
      });
      setNewFile(null);
      setShowAddRow(false);
      toast.success("Lab bill added");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add lab bill");
    } finally {
      setSaving(false);
    }
  }

  async function updateBill(id: string, updates: Record<string, unknown>) {
    setUploading(id);
    try {
      const res = await fetch(`/pay/api/lab-bills/${id}`, {
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

  async function uploadFile(billId: string, file: File, labName: string) {
    setUploading(billId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("labBillId", billId);
      formData.append("entity_name", labName);
      const res = await fetch("/pay/api/lab-bills/upload", { method: "POST", body: formData });
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

  async function addNewLab() {
    if (!newLabName.trim()) return;
    const res = await fetch("/pay/api/saved-entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "lab", name: newLabName.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      entity?: { id: string; name: string };
    };
    if (!res.ok) {
      toast.error(data.error ?? "Failed to add lab");
      return;
    }
    const name = newLabName.trim();
    const id = data.entity?.id ?? name;
    setSavedLabs((prev) => [...prev, { id, name }]);
    setNewBill({ ...newBill, lab_name: name });
    setNewLabName("");
    setShowNewLab(false);
    toast.success("Lab added");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setRemoving(true);
    try {
      const res = await fetch(`/pay/api/lab-bills/${deleteTarget.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setDeleteTarget(null);
      toast.success("Lab bill deleted");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setRemoving(false);
    }
  }

  function renderBillRow(bill: LabBillListItem) {
    return (
      <tr
        key={bill.id}
        className={`hidden border-b border-(--color-border-subtle) transition last:border-0 hover:bg-(--color-bg-subtle)/50 md:table-row ${
          bill.paid ? "bg-emerald-50/30" : ""
        }`}
      >
        <td className="whitespace-nowrap px-3 py-2 text-xs text-(--color-text-tertiary)">
          {dateLabel(bill)}
        </td>
        <td className="px-3 py-2 text-sm font-medium text-(--color-text-primary)">
          {bill.labName ?? "—"}
        </td>
        <td className="px-3 py-2">
          <select
            value={bill.dentistId || ""}
            onChange={(e) =>
              void updateBill(bill.id, { dentistId: e.target.value || null })
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
        <td className="max-w-[180px] truncate px-3 py-2 text-xs text-(--color-text-tertiary)">
          {bill.description || "-"}
        </td>
        <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
          {formatMoneyGBP(bill.amountPence)}
        </td>
        <td className="px-3 py-2 text-center">
          {bill.fileUrl ? (
            <button
              type="button"
              onClick={() => setPreviewUrl(bill.fileUrl)}
              className="p-1 text-blue-600 hover:text-blue-700"
              title="View invoice"
            >
              <Eye size={16} />
            </button>
          ) : (
            <label className="cursor-pointer p-1 text-(--color-text-tertiary) transition hover:text-(--color-brand)">
              {uploading === bill.id ? (
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
                    void uploadFile(bill.id, e.target.files[0], bill.labName ?? "lab");
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
              void updateBill(bill.id, {
                paid: !bill.paid,
                paid_date: bill.paid ? null : new Date().toISOString().substring(0, 10),
              })
            }
            className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border-2 transition ${
              bill.paid
                ? "border-green-500 bg-green-500 text-white"
                : "border-gray-300 hover:border-green-400"
            }`}
            title="Paid"
          >
            {bill.paid ? <Check size={12} /> : null}
          </button>
        </td>
        <td className="px-3 py-2 text-center">
          <button
            type="button"
            onClick={() => setDeleteTarget(bill)}
            className="p-1 text-(--color-text-tertiary) transition hover:text-(--color-danger)"
            title="Delete this lab bill?"
          >
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
    );
  }

  function renderBillCard(bill: LabBillListItem) {
    return (
      <div
        key={bill.id}
        className={`border-b border-(--color-border-subtle) p-3.5 last:border-0 md:hidden ${
          bill.paid ? "bg-emerald-50/30" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{bill.labName}</span>
              {bill.paid && (
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                  Paid
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-(--color-text-secondary)">
              {dateLabel(bill)}
              {bill.dentistName ? ` · ${bill.dentistName}` : ""}
            </div>
            {bill.description ? (
              <div className="mt-0.5 truncate text-xs text-(--color-text-tertiary)">
                {bill.description}
              </div>
            ) : null}
          </div>
          <span className="whitespace-nowrap text-base font-bold tabular-nums">
            {formatMoneyGBP(bill.amountPence)}
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-3 border-t border-(--color-border-subtle)/50 pt-2">
          <select
            value={bill.dentistId || ""}
            onChange={(e) =>
              void updateBill(bill.id, { dentistId: e.target.value || null })
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
            {bill.fileUrl ? (
              <button
                type="button"
                onClick={() => setPreviewUrl(bill.fileUrl)}
                className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"
                title="View"
              >
                <Eye size={18} />
              </button>
            ) : (
              <label className="cursor-pointer rounded-lg p-2 text-(--color-text-tertiary) transition hover:bg-(--color-bg-subtle)">
                {uploading === bill.id ? (
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
                      void uploadFile(bill.id, e.target.files[0], bill.labName ?? "lab");
                    }
                  }}
                />
              </label>
            )}
            <button
              type="button"
              onClick={() =>
                void updateBill(bill.id, {
                  paid: !bill.paid,
                  paid_date: bill.paid ? null : new Date().toISOString().substring(0, 10),
                })
              }
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${
                bill.paid
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-gray-300 hover:border-green-400"
              }`}
            >
              {bill.paid ? <Check size={14} /> : null}
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(bill)}
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
              {matrix.labNames.map((ln) => (
                <th
                  key={ln}
                  className="min-w-[90px] whitespace-nowrap px-3 py-2.5 text-right font-semibold text-(--color-text-secondary)"
                >
                  {ln}
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
              const rowTotal = matrix.labNames.reduce(
                (s, ln) => s + (row?.get(ln)?.totalPence || 0),
                0
              );
              return (
                <tr
                  key={mk}
                  className="border-b border-(--color-border-subtle) transition hover:bg-(--color-bg-subtle)/50"
                >
                  <td className="sticky left-0 z-10 bg-(--color-surface) px-3 py-2 font-medium">
                    {formatLabBillMonthKey(mk)}
                  </td>
                  {matrix.labNames.map((ln) => {
                    const cell = row?.get(ln);
                    if (!cell) {
                      return (
                        <td key={ln} className="px-3 py-2 text-right text-(--color-text-tertiary)">
                          -
                        </td>
                      );
                    }
                    return (
                      <td
                        key={ln}
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
              {matrix.labNames.map((ln) => (
                <td key={ln} className="px-3 py-2.5 text-right font-bold tabular-nums">
                  {formatMoneyGBP(matrix.columnTotals.get(ln) || 0)}
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
    <div className="space-y-4 sm:space-y-5" data-testid="lab-bills-page">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-h2 text-(--color-text-primary)">Lab Bills</h1>
          <p className="mt-0.5 text-body-sm text-(--color-text-secondary)">
            Track and manage dental lab bills
          </p>
        </div>
        <Button onClick={() => setShowAddRow(true)} className="w-full sm:w-auto">
          <Plus className="mr-1.5 h-4 w-4" />
          Add Lab Bill
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
          <p className="mt-0.5 text-xl font-bold tabular-nums">{formatMoneyGBP(summary.totalPence)}</p>
          <p className="mt-0.5 text-[10px] text-(--color-text-tertiary)">{summary.count} bills</p>
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
            {filtered.filter((b) => b.paid).length} bills
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
          <p className="mt-0.5 text-[10px] text-(--color-text-tertiary)">{summary.unpaidCount} bills</p>
        </button>
        <div className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-text-tertiary)">
            With Invoice
          </p>
          <p className="mt-0.5 text-xl font-bold">
            {withInvoice}
            <span className="text-sm font-normal text-(--color-text-secondary)">/{filtered.length}</span>
          </p>
          <p className="mt-0.5 text-[10px] text-(--color-text-tertiary)">{invoicePct}% uploaded</p>
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
            placeholder="Search bills..."
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
            onChange={(e) => setFilterMonth(e.target.value ? parseInt(e.target.value, 10) : null)}
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
            value={filterLab}
            onChange={(e) => setFilterLab(e.target.value)}
            className={`${selectCls} flex-1 sm:flex-none`}
          >
            <option value="">All Labs</option>
            {uniqueLabs.map((l) => (
              <option key={l} value={l}>
                {l}
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
            {(["none", "lab", "dentist", "month"] as GroupBy[]).map((g) => (
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
          {(["none", "lab", "dentist", "month"] as GroupBy[]).map((g) => (
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
                  <div className="flex items-center gap-2">
                    {collapsedGroups.has(group.key) ? (
                      <ChevronRight size={14} className="text-(--color-text-tertiary)" />
                    ) : (
                      <ChevronDown size={14} className="text-(--color-text-tertiary)" />
                    )}
                    <span className="text-sm font-semibold">{group.key}</span>
                    <span className="text-xs text-(--color-text-secondary)">
                      ({group.count} bill{group.count !== 1 ? "s" : ""})
                    </span>
                    {group.unpaidCount > 0 && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        {group.unpaidCount} unpaid
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {group.unpaidTotal > 0 && (
                      <span className="font-semibold text-red-600">
                        {formatMoneyGBP(group.unpaidTotal)} unpaid
                      </span>
                    )}
                    <span className="font-bold tabular-nums">{formatMoneyGBP(group.total)}</span>
                  </div>
                </button>
                {!collapsedGroups.has(group.key) && (
                  <>
                    <table className="hidden w-full text-sm md:table">
                      <tbody>{group.items.map(renderBillRow)}</tbody>
                    </table>
                    <div className="md:hidden">{group.items.map(renderBillCard)}</div>
                  </>
                )}
              </div>
            ))}
            {grouped.length === 0 && (
              <p className="py-8 text-center text-sm text-(--color-text-secondary)">
                No bills match your filters
              </p>
            )}
            {grouped.length > 0 && (
              <div className="flex items-center justify-between border-t-2 border-(--color-border-subtle) bg-(--color-bg-subtle) px-4 py-3">
                <span className="text-sm font-bold">Grand Total ({filtered.length} bills)</span>
                <div className="flex items-center gap-4 text-sm">
                  {summary.unpaidPence > 0 && (
                    <span className="font-semibold text-red-600">
                      {formatMoneyGBP(summary.unpaidPence)} unpaid
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
                    value={newBill.date}
                    onChange={(e) => setNewBill({ ...newBill, date: e.target.value })}
                    className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={newBill.amount}
                    onChange={(e) => setNewBill({ ...newBill, amount: e.target.value })}
                    className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-right text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={newBill.lab_name}
                    onChange={(e) => setNewBill({ ...newBill, lab_name: e.target.value })}
                    className="flex-1 rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-sm"
                  >
                    <option value="">Select lab...</option>
                    {savedLabs.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewLab(true)}
                    className="shrink-0 p-2 text-(--color-brand)"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                {showNewLab && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="New lab name"
                      value={newLabName}
                      onChange={(e) => setNewLabName(e.target.value)}
                      className="flex-1 rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-sm"
                    />
                    <button type="button" onClick={() => void addNewLab()} className="p-2 text-green-600">
                      <Check size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewLab(false);
                        setNewLabName("");
                      }}
                      className="p-2 text-(--color-text-tertiary)"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                <select
                  value={newBill.dentist_id}
                  onChange={(e) => setNewBill({ ...newBill, dentist_id: e.target.value })}
                  className="w-full rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-sm"
                >
                  <option value="">Assign dentist...</option>
                  {dentists.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newBill.description}
                  onChange={(e) => setNewBill({ ...newBill, description: e.target.value })}
                  className="w-full rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-sm"
                />
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
                  <Button className="flex-1" loading={saving} onClick={() => void addBill()}>
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
                      Lab
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-(--color-text-secondary)">
                      Dentist
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
                          value={newBill.date}
                          onChange={(e) => setNewBill({ ...newBill, date: e.target.value })}
                          className="w-full rounded border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <select
                            value={newBill.lab_name}
                            onChange={(e) => setNewBill({ ...newBill, lab_name: e.target.value })}
                            className="flex-1 rounded border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1 text-xs"
                          >
                            <option value="">Select lab...</option>
                            {savedLabs.map((l) => (
                              <option key={l.id} value={l.name}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowNewLab(true)}
                            className="shrink-0 text-(--color-brand)"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        {showNewLab && (
                          <div className="mt-1 flex items-center gap-1">
                            <input
                              type="text"
                              placeholder="New lab name"
                              value={newLabName}
                              onChange={(e) => setNewLabName(e.target.value)}
                              className="flex-1 rounded border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1 text-[10px]"
                            />
                            <button
                              type="button"
                              onClick={() => void addNewLab()}
                              className="text-green-600"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowNewLab(false);
                                setNewLabName("");
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
                          value={newBill.dentist_id}
                          onChange={(e) => setNewBill({ ...newBill, dentist_id: e.target.value })}
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
                          placeholder="Description"
                          value={newBill.description}
                          onChange={(e) => setNewBill({ ...newBill, description: e.target.value })}
                          className="w-full rounded border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={newBill.amount}
                          onChange={(e) => setNewBill({ ...newBill, amount: e.target.value })}
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
                            onClick={() => void addBill()}
                            disabled={saving}
                            className="text-green-600 hover:text-green-700"
                          >
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
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
                  {filtered.map(renderBillRow)}
                  {filtered.length === 0 && !showAddRow && (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-8 text-center text-sm text-(--color-text-secondary)"
                      >
                        No lab bills match your filters
                      </td>
                    </tr>
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-(--color-border-subtle) bg-(--color-bg-subtle)">
                      <td colSpan={4} className="px-3 py-2.5 text-xs font-bold">
                        Total ({filtered.length} bills)
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
              {filtered.map(renderBillCard)}
              {filtered.length === 0 && !showAddRow && (
                <p className="py-8 text-center text-sm text-(--color-text-secondary)">
                  No lab bills match your filters
                </p>
              )}
              {filtered.length > 0 && (
                <div className="flex items-center justify-between border-t-2 border-(--color-border-subtle) bg-(--color-bg-subtle) px-4 py-3">
                  <span className="text-xs font-bold">{filtered.length} bills</span>
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
        title="Delete this lab bill?"
        description="This cannot be undone."
        confirmLabel={removing ? "Deleting..." : "Delete"}
        variant="destructive"
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
