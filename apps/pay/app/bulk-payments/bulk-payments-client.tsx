"use client";

import * as React from "react";
import {
  Button,
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
  EmptyState,
} from "@elio/ui";

interface BulkPaymentItem {
  id: string;
  type: "lab" | "supplier";
  entityName: string;
  amountPence: number;
  description: string | null;
  date: string;
}

const fmt = (pence: number) => `£${(pence / 100).toFixed(2)}`;

function toCsv(items: BulkPaymentItem[]): string {
  // NOTE: no bank-detail fields exist on SavedLab/SavedSupplier in this schema
  // yet (unlike aurapay's reference), so the export carries payee name,
  // reference and amount only — no sort code / account number columns.
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
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

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
    setSelected((prev) =>
      prev.size === initialItems.length ? new Set() : new Set(initialItems.map((i) => i.id))
    );
  }

  function exportCsv() {
    const items = selected.size > 0 ? selectedItems : initialItems;
    const csv = toCsv(items);
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Lab bills &amp; supplier invoices</CardTitle>
            <p className="mt-1 text-body-sm text-[--color-text-secondary]">
              {initialItems.length} entries totalling {fmt(total)}
              {selected.size > 0 && ` — ${selected.size} selected: ${fmt(selectedTotal)}`}
            </p>
          </div>
          <Button onClick={exportCsv} disabled={initialItems.length === 0}>
            Export CSV{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
        </CardHeader>
        <CardContent>
          {initialItems.length === 0 ? (
            <EmptyState title="Nothing to pay" description="Lab bills and supplier invoices will appear here." />
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
                {initialItems.map((item) => (
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
                    <TableCell>{fmt(item.amountPence)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
