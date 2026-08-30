"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, toast, TablePanel, TableToolbar, TablePagination, useClientTablePagination } from "@elio/ui";

export interface ReminderRow {
  id: string;
  dueAt: string;
  channel: string | null;
  consultId: string;
  patientName: string;
}

export function RemindersList({ initialRows }: { initialRows: ReminderRow[] }) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initialRows);
  const [markingId, setMarkingId] = React.useState<string | null>(null);
  const { items, page, pageSize, totalCount, setPage, showPagination } = useClientTablePagination(rows);

  React.useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  async function markSent(id: string) {
    setMarkingId(id);
    const prevRows = rows;
    setRows((r) => r.filter((row) => row.id !== id));
    try {
      // basePath is "/flow" — fetch() is never auto-prefixed by Next.
      const res = await fetch(`/flow/api/reminders/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Failed to mark sent");
      router.refresh();
    } catch (err) {
      setRows(prevRows);
      toast.error("Couldn't mark reminder sent", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <TablePanel
      toolbar={<TableToolbar title="Outstanding reminders" onRefresh={() => router.refresh()} />}
      footer={showPagination ? <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} /> : undefined}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Due</TableHead>
            <TableHead>Patient</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{new Date(r.dueAt).toLocaleDateString("en-GB")}</TableCell>
              <TableCell>{r.patientName}</TableCell>
              <TableCell>{r.channel ?? "—"}</TableCell>
              <TableCell>
                <Button size="sm" variant="secondary" loading={markingId === r.id} onClick={() => markSent(r.id)}>
                  Mark sent
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TablePanel>
  );
}
