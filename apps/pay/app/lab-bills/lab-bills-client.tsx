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
} from "@elio/ui";
import { Eye, LayoutGrid, List, Loader2, Trash2, Upload } from "lucide-react";
import {
  buildLabBillMatrix,
  filterLabBills,
  formatLabBillMonthKey,
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

export function LabBillsClient({
  initialLabBills,
  dentists,
  savedLabs,
  initialYear,
}: {
  initialLabBills: LabBillListItem[];
  dentists: DentistOption[];
  savedLabs: SavedLabOption[];
  initialYear: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [formDentistId, setFormDentistId] = React.useState<string>("__none__");
  const [formSavedLabId, setFormSavedLabId] = React.useState<string>("__none__");
  const [filterYear, setFilterYear] = React.useState(initialYear);
  const [filterMonth, setFilterMonth] = React.useState<string>("__all__");
  const [payFilter, setPayFilter] = React.useState<LabPayFilter>("all");
  const [filterLab, setFilterLab] = React.useState<string>("__all__");
  const [filterDentistId, setFilterDentistId] = React.useState<string>("__all__");
  const [search, setSearch] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"list" | "matrix">("list");
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const filtered = React.useMemo(
    () =>
      filterLabBills(initialLabBills, {
        payFilter,
        labName: filterLab === "__all__" ? undefined : filterLab,
        dentistId: filterDentistId === "__all__" ? undefined : filterDentistId,
        search,
        year: filterYear,
        month: filterMonth === "__all__" ? null : Number(filterMonth),
      }),
    [initialLabBills, payFilter, filterLab, filterDentistId, search, filterYear, filterMonth]
  );

  const summary = React.useMemo(() => summarizeLabBills(filtered), [filtered]);
  const matrix = React.useMemo(() => buildLabBillMatrix(filtered), [filtered]);
  const uniqueLabs = React.useMemo(
    () => [...new Set(initialLabBills.map((b) => b.labName).filter(Boolean) as string[])].sort(),
    [initialLabBills]
  );

  const { items, page, pageSize, totalCount, setPage, showPagination } = useClientTablePagination(
    filtered,
    undefined,
    [payFilter, filterLab, filterDentistId, search, filterYear, filterMonth, viewMode]
  );

  const mutate = async (id: string, fn: () => Promise<Response>) => {
    setPendingId(id);
    setError(null);
    try {
      const res = await fn();
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
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
    const billDate = String(form.get("billDate") ?? "");
    const body: Record<string, unknown> = {
      amountPence: Math.round(amount * 100),
      description: form.get("description") || null,
      dentistId: formDentistId === "__none__" ? null : formDentistId,
      savedLabId: formSavedLabId === "__none__" ? null : formSavedLabId,
      billDate: billDate || null,
    };

    const res = await fetch("/pay/api/lab-bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create lab bill");
      return;
    }
    (e.target as HTMLFormElement).reset();
    setFormDentistId("__none__");
    setFormSavedLabId("__none__");
    router.refresh();
  }

  const uploadFile = async (bill: LabBillListItem, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("labBillId", bill.id);
    form.append("entity_name", bill.labName ?? "lab");
    await mutate(bill.id, () => fetch("/pay/api/lab-bills/upload", { method: "POST", body: form }));
  };

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["all", "Total", summary.totalPence, `${summary.count} bills`],
            ["paid", "Paid", summary.paidPence, "Settled"],
            ["unpaid", "Unpaid", summary.unpaidPence, `${summary.unpaidCount} bills`],
          ] as const
        ).map(([key, label, amount, sub]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPayFilter(key)}
            className={`rounded-(--radius-lg) border p-4 text-left transition ${
              payFilter === key ? "border-(--color-brand) bg-(--color-brand-subtle)" : "border-(--color-border-subtle) bg-(--color-surface)"
            }`}
          >
            <p className="text-caption font-semibold uppercase tracking-wide text-(--color-text-tertiary)">{label}</p>
            <p className="mt-1 text-h4 font-semibold tabular-nums">{formatMoneyGBP(amount)}</p>
            <p className="mt-0.5 text-caption text-(--color-text-tertiary)">{sub}</p>
          </button>
        ))}
        <div className="rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-4">
          <p className="text-caption font-semibold uppercase tracking-wide text-(--color-text-tertiary)">View</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={`flex items-center gap-1 rounded-(--radius-md) px-2 py-1 text-caption ${viewMode === "list" ? "bg-(--color-brand) text-white" : "bg-(--color-surface-dim)"}`}
              onClick={() => setViewMode("list")}
            >
              <List className="size-3.5" /> List
            </button>
            <button
              type="button"
              className={`flex items-center gap-1 rounded-(--radius-md) px-2 py-1 text-caption ${viewMode === "matrix" ? "bg-(--color-brand) text-white" : "bg-(--color-surface-dim)"}`}
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
            <CardTitle>Add a lab bill</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="savedLabId">Lab</Label>
                <Select value={formSavedLabId} onValueChange={setFormSavedLabId}>
                  <SelectTrigger id="savedLabId">
                    <SelectValue placeholder="Select lab" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select lab…</SelectItem>
                    {savedLabs.map((lab) => (
                      <SelectItem key={lab.id} value={lab.id}>
                        {lab.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dentistId">Dentist</Label>
                <Select value={formDentistId} onValueChange={setFormDentistId}>
                  <SelectTrigger id="dentistId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {dentists.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="billDate">Bill date</Label>
                <Input id="billDate" name="billDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div>
                <Label htmlFor="amount">Amount (£)</Label>
                <Input id="amount" name="amount" type="number" step="0.01" required />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" placeholder="e.g. Crown - John Smith" />
              </div>
              <div className="sm:col-span-3">
                {error ? <p className="mb-2 text-body-sm text-(--color-danger)">{error}</p> : null}
                <Button type="submit" loading={submitting} disabled={formSavedLabId === "__none__"}>
                  Add lab bill
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <TablePanel
          toolbar={
            <TableToolbar title="Lab bills" onRefresh={() => router.refresh()}>
              <div className="flex flex-wrap items-center gap-2">
                <Input className="w-40" type="number" value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} />
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
                <Select value={filterLab} onValueChange={setFilterLab}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All labs</SelectItem>
                    {uniqueLabs.map((lab) => (
                      <SelectItem key={lab} value={lab}>
                        {lab}
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
                <Input className="w-48" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </TableToolbar>
          }
          footer={viewMode === "list" && showPagination ? <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} /> : undefined}
        >
          {filtered.length === 0 ? (
            <EmptyState title="No lab bills" description="Add a lab bill above, or adjust the filters." className="py-12" />
          ) : viewMode === "matrix" ? (
            <div className="overflow-x-auto p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    {matrix.labNames.map((lab) => (
                      <TableHead key={lab} className="text-right">
                        {lab}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrix.monthKeys.map((monthKey) => {
                    const rowTotal = matrix.labNames.reduce(
                      (sum, lab) => sum + (matrix.lookup.get(monthKey)?.get(lab)?.totalPence ?? 0),
                      0
                    );
                    return (
                      <TableRow key={monthKey}>
                        <TableCell>{formatLabBillMonthKey(monthKey)}</TableCell>
                        {matrix.labNames.map((lab) => {
                          const cell = matrix.lookup.get(monthKey)?.get(lab);
                          return (
                            <TableCell key={lab} className={`text-right font-mono tabular-nums ${cell?.allPaid ? "text-(--color-success)" : "text-(--color-danger)"}`}>
                              {cell ? formatMoneyGBP(cell.totalPence) : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCellMoney className="font-semibold">{formatMoneyGBP(rowTotal)}</TableCellMoney>
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
                  <TableHead>Lab</TableHead>
                  <TableHead>Dentist</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((b) => (
                  <TableRow key={b.id} className={b.paid ? "bg-emerald-50/40" : undefined}>
                    <TableCell>{new Date(b.billDate ?? b.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{b.labName ?? "—"}</TableCell>
                    <TableCell>{b.dentistName ?? "Unassigned"}</TableCell>
                    <TableCell>{b.description ?? "—"}</TableCell>
                    <TableCellMoney>{formatMoneyGBP(b.amountPence)}</TableCellMoney>
                    <TableCell>
                      {b.fileUrl ? (
                        <a href={b.fileUrl} target="_blank" rel="noreferrer" className="text-(--color-brand)">
                          <Eye className="size-4" />
                        </a>
                      ) : (
                        <label className="cursor-pointer text-(--color-text-tertiary) hover:text-(--color-brand)">
                          {pendingId === b.id ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void uploadFile(b, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        disabled={pendingId === b.id}
                        onClick={() =>
                          void mutate(b.id, () =>
                            fetch(`/pay/api/lab-bills/${b.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ paid: !b.paid }),
                            })
                          )
                        }
                        className={`rounded-full px-2.5 py-0.5 text-caption font-medium ${
                          b.paid ? "bg-(--color-success-subtle) text-(--color-success)" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {b.paid ? "Paid" : "Unpaid"}
                      </button>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="text-(--color-danger)"
                        disabled={pendingId === b.id}
                        onClick={() => {
                          if (!confirm("Delete this lab bill?")) return;
                          void mutate(b.id, () => fetch(`/pay/api/lab-bills/${b.id}`, { method: "DELETE" }));
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TablePanel>
      </div>
    </>
  );
}
