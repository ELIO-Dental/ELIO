"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCellMoney,
  TablePanel,
  formatMoneyGBP,
  EmptyState,
  TableToolbar,
  TablePagination,
  useClientTablePagination,
  toast,
  ConfirmDialog,
} from "@elio/ui";
import { Eye, LayoutGrid, List, Loader2, Trash2, Upload } from "lucide-react";
import {
  buildSupplierInvoiceMatrix,
  filterSupplierInvoices,
  formatSupplierInvoiceMonthKey,
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

const NO_SUPPLIER = "__none__";
const NO_DENTIST = "__none__";

export function SupplierInvoicesClient({
  initialSupplierInvoices,
  dentists,
  suppliers,
  initialYear,
}: {
  initialSupplierInvoices: SupplierInvoiceListItem[];
  dentists: DentistOption[];
  suppliers: SupplierOption[];
  initialYear: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [formSupplierId, setFormSupplierId] = React.useState<string>(NO_SUPPLIER);
  const [formDentistId, setFormDentistId] = React.useState<string>(NO_DENTIST);
  const [filterYear, setFilterYear] = React.useState(initialYear);
  const [filterMonth, setFilterMonth] = React.useState<string>("__all__");
  const [payFilter, setPayFilter] = React.useState<SupplierPayFilter>("all");
  const [filterSupplier, setFilterSupplier] = React.useState<string>("__all__");
  const [filterDentistId, setFilterDentistId] = React.useState<string>("__all__");
  const [search, setSearch] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"list" | "matrix">("list");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<SupplierInvoiceListItem | null>(null);

  const filtered = React.useMemo(
    () =>
      filterSupplierInvoices(initialSupplierInvoices, {
        payFilter,
        supplierName: filterSupplier === "__all__" ? undefined : filterSupplier,
        dentistId: filterDentistId === "__all__" ? undefined : filterDentistId,
        search,
        year: filterYear,
        month: filterMonth === "__all__" ? null : Number(filterMonth),
      }),
    [initialSupplierInvoices, payFilter, filterSupplier, filterDentistId, search, filterYear, filterMonth]
  );

  const summary = React.useMemo(() => summarizeSupplierInvoices(filtered), [filtered]);
  const matrix = React.useMemo(() => buildSupplierInvoiceMatrix(filtered), [filtered]);
  const uniqueSuppliers = React.useMemo(
    () =>
      [
        ...new Set(
          initialSupplierInvoices.map((i) => i.supplierName).filter(Boolean) as string[]
        ),
      ].sort(),
    [initialSupplierInvoices]
  );

  const { items, page, pageSize, totalCount, setPage, showPagination } = useClientTablePagination(
    filtered,
    undefined,
    [payFilter, filterSupplier, filterDentistId, search, filterYear, filterMonth, viewMode]
  );

  const mutate = async (id: string, fn: () => Promise<Response>, successMsg?: string) => {
    setPendingId(id);
    setError(null);
    try {
      const res = await fn();
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      if (successMsg) toast.success(successMsg);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setPendingId(null);
    }
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const amount = Number(form.get("amount"));
    const invoiceDate = String(form.get("invoiceDate") ?? "");
    const body: Record<string, unknown> = {
      amountPence: Math.round(amount * 100),
      description: form.get("description") || null,
      invoiceNumber: String(form.get("invoiceNumber") ?? "").trim() || null,
      supplierId: formSupplierId === NO_SUPPLIER ? null : formSupplierId,
      dentistId: formDentistId === NO_DENTIST ? null : formDentistId,
      invoiceDate: invoiceDate || null,
    };

    const res = await fetch("/pay/api/supplier-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error ?? "Failed to create supplier invoice";
      setError(msg);
      toast.error(msg);
      return;
    }
    toast.success("Supplier invoice added");
    (e.target as HTMLFormElement).reset();
    setFormSupplierId(NO_SUPPLIER);
    setFormDentistId(NO_DENTIST);
    router.refresh();
  }

  const uploadFile = async (invoice: SupplierInvoiceListItem, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("supplierInvoiceId", invoice.id);
    form.append("entity_name", invoice.supplierName ?? "supplier");
    await mutate(
      invoice.id,
      () => fetch("/pay/api/supplier-invoices/upload", { method: "POST", body: form }),
      "File uploaded"
    );
  };

  return (
    <div data-testid="supplier-invoices-page">
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["all", "Total", summary.totalPence, `${summary.count} invoices`],
            ["paid", "Paid", summary.paidPence, "Settled"],
            ["unpaid", "Unpaid", summary.unpaidPence, `${summary.unpaidCount} invoices`],
          ] as const
        ).map(([key, label, amount, sub]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPayFilter(key)}
            className={`rounded-(--radius-lg) border p-4 text-left transition ${
              payFilter === key
                ? "border-(--color-brand) bg-(--color-brand-subtle)"
                : "border-(--color-border-subtle) bg-(--color-surface)"
            }`}
          >
            <p className="text-caption font-semibold uppercase tracking-wide text-(--color-text-tertiary)">
              {label}
            </p>
            <p className="mt-1 text-h4 font-semibold tabular-nums">{formatMoneyGBP(amount)}</p>
            <p className="mt-0.5 text-caption text-(--color-text-tertiary)">{sub}</p>
          </button>
        ))}
        <div className="rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-4">
          <p className="text-caption font-semibold uppercase tracking-wide text-(--color-text-tertiary)">
            View
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={`flex items-center gap-1 rounded-(--radius-md) px-2 py-1 text-caption ${
                viewMode === "list" ? "bg-(--color-brand) text-white" : "bg-(--color-surface-dim)"
              }`}
              onClick={() => setViewMode("list")}
            >
              <List className="size-3.5" /> List
            </button>
            <button
              type="button"
              className={`flex items-center gap-1 rounded-(--radius-md) px-2 py-1 text-caption ${
                viewMode === "matrix" ? "bg-(--color-brand) text-white" : "bg-(--color-surface-dim)"
              }`}
              onClick={() => setViewMode("matrix")}
            >
              <LayoutGrid className="size-3.5" /> Matrix
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Add a supplier invoice</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="supplierId">Supplier</Label>
                <Select value={formSupplierId} onValueChange={setFormSupplierId}>
                  <SelectTrigger id="supplierId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SUPPLIER}>Unassigned</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dentistId">Dentist</Label>
                <Select value={formDentistId} onValueChange={setFormDentistId}>
                  <SelectTrigger id="dentistId">
                    <SelectValue placeholder="Select dentist" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DENTIST}>Unassigned</SelectItem>
                    {dentists.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="invoiceNumber">Invoice #</Label>
                <Input id="invoiceNumber" name="invoiceNumber" placeholder="e.g. INV-1042" />
              </div>
              <div>
                <Label htmlFor="invoiceDate">Invoice date</Label>
                <Input
                  id="invoiceDate"
                  name="invoiceDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div>
                <Label htmlFor="amount">Amount (£)</Label>
                <Input id="amount" name="amount" type="number" step="0.01" required />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" placeholder="e.g. Dental supplies order" />
              </div>
              <div className="sm:col-span-3">
                {error ? <p className="mb-2 text-body-sm text-(--color-danger)">{error}</p> : null}
                <Button type="submit" loading={submitting}>
                  Add supplier invoice
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <TablePanel
          toolbar={
            <TableToolbar title="Supplier invoices" onRefresh={() => router.refresh()}>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="w-40"
                  type="number"
                  value={filterYear}
                  onChange={(e) => setFilterYear(Number(e.target.value))}
                />
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All months</SelectItem>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {new Date(2000, i, 1).toLocaleString("en-GB", { month: "long" })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All suppliers</SelectItem>
                    {uniqueSuppliers.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterDentistId} onValueChange={setFilterDentistId}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All dentists</SelectItem>
                    {dentists.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="w-48"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </TableToolbar>
          }
          footer={
            viewMode === "list" && showPagination ? (
              <TablePagination
                page={page}
                pageSize={pageSize}
                totalCount={totalCount}
                onPageChange={setPage}
              />
            ) : undefined
          }
        >
          {filtered.length === 0 ? (
            <EmptyState
              title="No supplier invoices"
              description="Add a supplier invoice above, or adjust the filters."
              className="py-12"
            />
          ) : viewMode === "matrix" ? (
            <div className="overflow-x-auto p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    {matrix.supplierNames.map((supplier) => (
                      <TableHead key={supplier} className="text-right">
                        {supplier}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrix.monthKeys.map((monthKey) => {
                    const rowTotal = matrix.supplierNames.reduce(
                      (sum, supplier) =>
                        sum + (matrix.lookup.get(monthKey)?.get(supplier)?.totalPence ?? 0),
                      0
                    );
                    return (
                      <TableRow key={monthKey}>
                        <TableCell>{formatSupplierInvoiceMonthKey(monthKey)}</TableCell>
                        {matrix.supplierNames.map((supplier) => {
                          const cell = matrix.lookup.get(monthKey)?.get(supplier);
                          return (
                            <TableCell
                              key={supplier}
                              className={`text-right font-mono tabular-nums ${
                                cell?.allPaid ? "text-(--color-success)" : "text-(--color-danger)"
                              }`}
                            >
                              {cell ? formatMoneyGBP(cell.totalPence) : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCellMoney className="font-semibold">
                          {formatMoneyGBP(rowTotal)}
                        </TableCellMoney>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Dentist</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id} className={i.paid ? "bg-emerald-50/40" : undefined}>
                    <TableCell>
                      {new Date(i.invoiceDate ?? i.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{i.supplierName ?? "Unassigned"}</TableCell>
                    <TableCell>{i.dentistName ?? "Unassigned"}</TableCell>
                    <TableCell>{i.invoiceNumber ?? "—"}</TableCell>
                    <TableCell>{i.description ?? "—"}</TableCell>
                    <TableCellMoney>{formatMoneyGBP(i.amountPence)}</TableCellMoney>
                    <TableCell>
                      {i.fileUrl ? (
                        <a
                          href={i.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-(--color-brand)"
                        >
                          <Eye className="size-4" />
                        </a>
                      ) : (
                        <label className="cursor-pointer text-(--color-text-tertiary) hover:text-(--color-brand)">
                          {pendingId === i.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Upload className="size-4" />
                          )}
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void uploadFile(i, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        loading={pendingId === i.id}
                        onClick={() =>
                          void mutate(
                            i.id,
                            () =>
                              fetch(`/pay/api/supplier-invoices/${i.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ paid: !i.paid }),
                              }),
                            i.paid ? "Marked unpaid" : "Marked paid"
                          )
                        }
                        className={`rounded-full px-2.5 py-0.5 text-caption font-medium ${
                          i.paid
                            ? "bg-(--color-success-bg) text-(--color-success)"
                            : "bg-(--color-warning-bg) text-(--color-warning)"
                        }`}
                      >
                        {i.paid ? "Paid" : "Unpaid"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-(--color-danger)"
                        loading={pendingId === i.id}
                        onClick={() => setDeleteTarget(i)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TablePanel>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete supplier invoice?"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await mutate(
            deleteTarget.id,
            () => fetch(`/pay/api/supplier-invoices/${deleteTarget.id}`, { method: "DELETE" }),
            "Supplier invoice deleted"
          );
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
