"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  formatMoneyGBP,
  toast,
} from "@elio/ui";
import { Search } from "lucide-react";

type DentallySearchPatient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  phone?: string;
};

type PlanOption = {
  id: string;
  name: string;
  monthlyPricePence: number;
};

/** Search Dentally and import a single patient (P2.4). */
export function ImportFromDentally({ plans }: { plans: PlanOption[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState<DentallySearchPatient[]>([]);
  const [configured, setConfigured] = React.useState<boolean | null>(null);
  const [selected, setSelected] = React.useState<DentallySearchPatient | null>(null);
  const [planId, setPlanId] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setResults([]);
    setSelected(null);
    try {
      const res = await fetch(`/plans/api/dentally/patients?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConfigured(data.configured === false ? false : null);
        toast.error(data.error ?? "Dentally search failed");
        return;
      }
      setConfigured(true);
      setResults(data.patients ?? []);
    } finally {
      setSearching(false);
    }
  }

  async function handleImport() {
    if (!selected) return;
    setImporting(true);
    try {
      const res = await fetch("/plans/api/dentally/import-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dentallyId: selected.id,
          firstName: selected.firstName,
          lastName: selected.lastName,
          email: selected.email || undefined,
          mobile: selected.mobile,
          phone: selected.phone,
          planId: planId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Import failed");
        return;
      }
      toast.success(data.created ? "Patient imported from Dentally" : "Existing patient updated from Dentally", {
        description: data.signupUrl ? "Signup link created — check enrolment card above." : undefined,
      });
      setQuery("");
      setResults([]);
      setSelected(null);
      setPlanId("");
      router.refresh();
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from Dentally</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {configured === false && (
          <p className="rounded-(--radius-md) border border-(--color-warning)/40 bg-(--color-warning-subtle) p-3 text-body-sm text-(--color-text-primary)">
            Dentally is not configured. Add your API key in Portal → Settings → Integrations.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <div className="min-w-[240px] flex-1">
            <Label htmlFor="dentally-search">Search Dentally</Label>
            <Input
              id="dentally-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void search()}
              placeholder="Name, email, phone, or patient ID"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={search} disabled={searching || query.trim().length < 2} loading={searching}>
              <Search className="mr-2 size-4" />
              Search
            </Button>
          </div>
        </div>

        {results.length > 0 && (
          <ul className="divide-y divide-(--color-border) rounded-(--radius-md) border border-(--color-border)">
            {results.map((patient) => {
              const name = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || `Patient ${patient.id}`;
              const isSelected = selected?.id === patient.id;
              return (
                <li key={patient.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-(--color-surface-subtle) ${isSelected ? "bg-(--color-surface-subtle)" : ""}`}
                    onClick={() => setSelected(patient)}
                  >
                    <div>
                      <p className="text-body font-medium text-(--color-text-primary)">{name}</p>
                      <p className="text-body-sm text-(--color-text-secondary)">
                        {patient.email || "No email"} · ID {patient.id}
                      </p>
                    </div>
                    {isSelected && <Badge variant="primary">Selected</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selected && (
          <div className="space-y-3 rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface-subtle) p-4">
            <p className="text-body-sm text-(--color-text-secondary)">
              Importing{" "}
              <span className="font-medium text-(--color-text-primary)">
                {[selected.firstName, selected.lastName].filter(Boolean).join(" ")}
              </span>{" "}
              (Dentally ID {selected.id})
            </p>
            <div>
              <Label htmlFor="import-plan">Assign plan (optional)</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger id="import-plan">
                  <SelectValue placeholder="Import only — no plan yet" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatMoneyGBP(p.monthlyPricePence)}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleImport} loading={importing}>
              {planId ? "Import and enrol" : "Import patient"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
