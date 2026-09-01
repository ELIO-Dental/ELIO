"use client";

import * as React from "react";
import Link from "next/link";
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
  dateOfBirth?: string;
  mobile?: string;
  phone?: string;
};

type PlanOption = {
  id: string;
  name: string;
  monthlyPricePence: number;
};

function formatDob(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

/** Search Dentally and import a single patient (P2.4). */
export function ImportFromDentally({ plans }: { plans: PlanOption[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [results, setResults] = React.useState<DentallySearchPatient[]>([]);
  const [configured, setConfigured] = React.useState<boolean | null>(null);
  const [selected, setSelected] = React.useState<DentallySearchPatient | null>(null);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  function selectPatient(patient: DentallySearchPatient) {
    setSelected(patient);
    setFirstName(patient.firstName);
    setLastName(patient.lastName);
    setEmail(patient.email);
    setMobile(patient.mobile || patient.phone || "");
  }

  function clearSelection() {
    setSelected(null);
    setFirstName("");
    setLastName("");
    setEmail("");
    setMobile("");
    setPlanId("");
  }

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setResults([]);
    clearSelection();
    setHasSearched(false);
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
      setHasSearched(true);
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
          firstName,
          lastName,
          email: email || undefined,
          mobile: mobile || undefined,
          planId: planId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Import failed");
        return;
      }

      const patientName = [firstName, lastName].filter(Boolean).join(" ") || `Patient ${selected.id}`;
      if (data.created) {
        toast.success(`Patient imported from Dentally`, {
          description: data.signupUrl ? "Signup link created — check enrolment card below." : undefined,
        });
      } else {
        toast.success(`Linked to existing patient: ${patientName}`, {
          description:
            data.matchedBy === "email"
              ? "Matched by email and updated Dentally link."
              : data.signupUrl
                ? "Signup link created for existing patient."
                : undefined,
        });
      }

      setQuery("");
      setResults([]);
      clearSelection();
      setHasSearched(false);
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
          <div className="rounded-(--radius-md) border border-(--color-warning)/40 bg-(--color-warning-subtle) p-3 text-body-sm text-(--color-text-primary)">
            <p>Dentally is not configured. Add your API key in Portal → Settings → Integrations.</p>
            <Button variant="secondary" size="sm" className="mt-3" asChild>
              <Link href="/settings/integrations">Go to Integrations</Link>
            </Button>
          </div>
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
            {!hasSearched && !searching && (
              <p className="mt-1.5 text-caption text-(--color-text-tertiary)">
                Type a name, email, phone, or patient ID and press Search.
              </p>
            )}
          </div>
          <div className="flex items-end">
            <Button onClick={search} disabled={searching || query.trim().length < 2} loading={searching}>
              <Search className="mr-2 size-4" />
              Search
            </Button>
          </div>
        </div>

        {searching && <p className="text-body-sm text-(--color-text-secondary)">Searching Dentally…</p>}

        {hasSearched && !searching && results.length === 0 && (
          <p className="text-body-sm text-(--color-text-secondary)">No patients found for &ldquo;{query.trim()}&rdquo;.</p>
        )}

        {results.length > 0 && !selected && (
          <ul className="divide-y divide-(--color-border) rounded-(--radius-md) border border-(--color-border)">
            {results.map((patient) => {
              const name = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || `Patient ${patient.id}`;
              const dob = formatDob(patient.dateOfBirth);
              return (
                <li key={patient.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-(--color-surface-subtle)"
                    onClick={() => selectPatient(patient)}
                  >
                    <div>
                      <p className="text-body font-medium text-(--color-text-primary)">{name}</p>
                      <p className="text-body-sm text-(--color-text-secondary)">
                        {patient.email || "No email"} · ID {patient.id}
                        {dob ? ` · DOB ${dob}` : ""}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selected && (
          <div className="space-y-4 rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface-subtle) p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="info">Linked to Dentally patient {selected.id}</Badge>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Back to search
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="import-first-name">First name</Label>
                <Input id="import-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="import-last-name">Last name</Label>
                <Input id="import-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="import-email">Email</Label>
                <Input id="import-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="import-mobile">Mobile</Label>
                <Input id="import-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </div>
            </div>

            {selected.dateOfBirth && (
              <p className="text-body-sm text-(--color-text-secondary)">
                Date of birth from Dentally: {formatDob(selected.dateOfBirth)}
              </p>
            )}

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
