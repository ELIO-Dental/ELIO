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
  EmptyState,
} from "@elio/ui";

interface DentistOption {
  id: string;
  name: string;
}

interface LabBillRow {
  id: string;
  dentistId: string | null;
  dentistName: string | null;
  amountPence: number;
  description: string | null;
  createdAt: string;
}

const ALL_DENTISTS = "__all__";
const NO_DENTIST = "__none__";

export function LabBillsClient({
  initialLabBills,
  dentists,
}: {
  initialLabBills: LabBillRow[];
  dentists: DentistOption[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [formDentistId, setFormDentistId] = React.useState<string>(NO_DENTIST);
  const [filterDentistId, setFilterDentistId] = React.useState<string>(ALL_DENTISTS);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const amount = Number(form.get("amount"));
    const body: Record<string, unknown> = {
      amountPence: Math.round(amount * 100),
      description: form.get("description") || null,
      dentistId: formDentistId === NO_DENTIST ? null : formDentistId,
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
    setFormDentistId(NO_DENTIST);
    router.refresh();
  }

  const filteredLabBills =
    filterDentistId === ALL_DENTISTS
      ? initialLabBills
      : initialLabBills.filter((b) => b.dentistId === filterDentistId);

  return (
    <>
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Add a lab bill</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="dentistId">Dentist</Label>
                <Select value={formDentistId} onValueChange={setFormDentistId}>
                  <SelectTrigger id="dentistId">
                    <SelectValue />
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
                <Label htmlFor="amount">Amount (£)</Label>
                <Input id="amount" name="amount" type="number" step="0.01" required />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" placeholder="e.g. Crown - John Smith" />
              </div>
              <div className="sm:col-span-2">
                {error && <p className="mb-2 text-body-sm text-(--color-danger)">{error}</p>}
                <Button type="submit" loading={submitting}>
                  Add lab bill
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-h3 text-(--color-text-primary)">All lab bills</h2>
        <div className="w-64">
          <Select value={filterDentistId} onValueChange={setFilterDentistId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DENTISTS}>All dentists</SelectItem>
              {dentists.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4">
        {filteredLabBills.length === 0 ? (
          <EmptyState title="No lab bills" description="Add a lab bill above, or adjust the filter." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Dentist</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLabBills.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{new Date(b.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>{b.dentistName ?? "Unassigned"}</TableCell>
                  <TableCell>{b.description ?? "—"}</TableCell>
                  <TableCell>£{(b.amountPence / 100).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
