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

interface SupplierOption {
  id: string;
  name: string;
}

interface SupplierInvoiceRow {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  amountPence: number;
  description: string | null;
  invoiceDate: string | null;
  paid: boolean;
  paidAt: string | null;
  createdAt: string;
}

const ALL_SUPPLIERS = "__all__";
const NO_SUPPLIER = "__none__";

export function SupplierInvoicesClient({
  initialSupplierInvoices,
  suppliers,
}: {
  initialSupplierInvoices: SupplierInvoiceRow[];
  suppliers: SupplierOption[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [formSupplierId, setFormSupplierId] = React.useState<string>(NO_SUPPLIER);
  const [filterSupplierName, setFilterSupplierName] = React.useState<string>("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const togglePaid = async (invoice: SupplierInvoiceRow) => {
    setPendingId(invoice.id);
    setError(null);
    try {
      const res = await fetch(`/pay/api/supplier-invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: !invoice.paid }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
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
    const invoiceDate = form.get("invoiceDate");
    const body: Record<string, unknown> = {
      amountPence: Math.round(amount * 100),
      description: form.get("description") || null,
      supplierId: formSupplierId === NO_SUPPLIER ? null : formSupplierId,
      invoiceDate: invoiceDate ? String(invoiceDate) : null,
    };

    const res = await fetch("/pay/api/supplier-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create supplier invoice");
      return;
    }
    (e.target as HTMLFormElement).reset();
    setFormSupplierId(NO_SUPPLIER);
    router.refresh();
  }

  const filteredSupplierInvoices = filterSupplierName
    ? initialSupplierInvoices.filter((i) =>
        (i.supplierName ?? "").toLowerCase().includes(filterSupplierName.toLowerCase())
      )
    : initialSupplierInvoices;

  const { items, page, pageSize, totalCount, setPage, showPagination } = useClientTablePagination(
    filteredSupplierInvoices,
    undefined,
    [filterSupplierName]
  );

  return (
    <>
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Add a supplier invoice</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <Label htmlFor="amount">Amount (£)</Label>
                <Input id="amount" name="amount" type="number" step="0.01" required />
              </div>
              <div>
                <Label htmlFor="invoiceDate">Invoice date</Label>
                <Input id="invoiceDate" name="invoiceDate" type="date" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" placeholder="e.g. Dental supplies order" />
              </div>
              <div className="sm:col-span-2">
                {error && <p className="mb-2 text-body-sm text-(--color-danger)">{error}</p>}
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
            <TableToolbar title="All supplier invoices" onRefresh={() => router.refresh()}>
              <div className="w-64">
                <Input
                  placeholder="Filter by supplier name"
                  value={filterSupplierName}
                  onChange={(e) => setFilterSupplierName(e.target.value)}
                />
              </div>
            </TableToolbar>
          }
          footer={showPagination ? <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} /> : undefined}
        >
          {filteredSupplierInvoices.length === 0 ? (
            <EmptyState title="No supplier invoices" description="Add a supplier invoice above, or adjust the filter." className="py-12" />
          ) : (
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    {i.invoiceDate ? new Date(i.invoiceDate).toLocaleDateString() : new Date(i.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{i.supplierName ?? "Unassigned"}</TableCell>
                  <TableCell>{i.description ?? "—"}</TableCell>
                  <TableCellMoney>{formatMoneyGBP(i.amountPence)}</TableCellMoney>
                  <TableCell>
                    <button
                      type="button"
                      disabled={pendingId === i.id}
                      onClick={() => void togglePaid(i)}
                      className={`rounded-full px-2.5 py-0.5 text-caption font-medium ${
                        i.paid
                          ? "bg-(--color-success-subtle) text-(--color-success)"
                          : "bg-(--color-warning-bg) text-(--color-warning) hover:opacity-90"
                      }`}
                    >
                      {i.paid ? "Paid" : "Unpaid"}
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
