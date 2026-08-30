"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
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
} from "@elio/ui";

interface BulkPaymentItem {
  id: string;
  type: "lab" | "supplier";
  entityName: string;
  amountPence: number;
  description: string | null;
  date: string;
}

function toCsv(items: BulkPaymentItem[]): string {
  const rows = ["Payee Name,Type,Amount,Reference,Date"];
  for (const item of items) {
    const ref = item.description || item.entityName;
    rows.push(
      `"${item.entityName}","${item.type === "lab" ? "Lab" : "Supplier"}","${(item.amountPence / 100).toFixed(2)}","${ref}","${item.date.substring(0, 10)}"`
    );
  }
  return rows.join("\n");
}

export function BulkPaymentsClient({ initialItems }: { initialItems: BulkPaymentItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const { items, page, pageSize, totalCount, setPage, showPagination } = useClientTablePagination(initialItems);

  const total = initialItems.reduce((s, i) => s + i.amountPence, 0);
  const selectedItems = initialItems.filter((i) => selected.has(i.id));
  const selectedTotal = selectedItems.reduce((s, i) => s + i.amountPence, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === initialItems.length ? new Set() : new Set(initialItems.map((i) => i.id))));
  }

  function exportCsv() {
    const exportItems = selected.size > 0 ? selectedItems : initialItems;
    const csv = toCsv(exportItems);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-payment-${new Date().toISOString().substring(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-6">
      <TablePanel
        toolbar={
          <TableToolbar title="Lab bills & supplier invoices" onRefresh={() => router.refresh()}>
            <p className="text-body-sm text-(--color-text-secondary)">
              {initialItems.length} entries totalling {formatMoneyGBP(total)}
              {selected.size > 0 && ` — ${selected.size} selected: ${formatMoneyGBP(selectedTotal)}`}
            </p>
            <Button onClick={exportCsv} disabled={initialItems.length === 0} size="sm">
              Export CSV{selected.size > 0 ? ` (${selected.size})` : ""}
            </Button>
          </TableToolbar>
        }
        footer={showPagination ? <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} /> : undefined}
      >
        {initialItems.length === 0 ? (
          <EmptyState title="Nothing to pay" description="Lab bills and supplier invoices will appear here." className="py-12" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === initialItems.length}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={`${item.type}-${item.id}`}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                      aria-label={`Select ${item.entityName}`}
                    />
                  </TableCell>
                  <TableCell>{item.entityName}</TableCell>
                  <TableCell>{item.type === "lab" ? "Lab" : "Supplier"}</TableCell>
                  <TableCell>{new Date(item.date).toLocaleDateString()}</TableCell>
                  <TableCell>{item.description ?? "—"}</TableCell>
                  <TableCellMoney>{formatMoneyGBP(item.amountPence)}</TableCellMoney>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TablePanel>
    </div>
  );
}
