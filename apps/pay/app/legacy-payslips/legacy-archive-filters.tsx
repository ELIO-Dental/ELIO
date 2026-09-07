"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button, Input, Label } from "@elio/ui";

export function LegacyArchiveFilters({
  dentist,
  year,
  years,
}: {
  dentist: string;
  year?: number;
  years: number[];
}) {
  const router = useRouter();
  const [dentistValue, setDentistValue] = React.useState(dentist);
  const [yearValue, setYearValue] = React.useState(year ? String(year) : "");

  React.useEffect(() => {
    setDentistValue(dentist);
    setYearValue(year ? String(year) : "");
  }, [dentist, year]);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    const d = dentistValue.trim();
    if (d) params.set("dentist", d);
    if (yearValue) params.set("year", yearValue);
    params.set("page", "1");
    const qs = params.toString();
    router.push(qs ? `/legacy-payslips?${qs}` : "/legacy-payslips");
  }

  function clear() {
    setDentistValue("");
    setYearValue("");
    router.push("/legacy-payslips");
  }

  return (
    <form
      onSubmit={apply}
      className="flex flex-col gap-3 rounded-xl border border-(--color-border-subtle) bg-(--color-surface) p-4 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="min-w-[180px] flex-1">
        <Label htmlFor="legacy-dentist">Dentist</Label>
        <Input
          id="legacy-dentist"
          value={dentistValue}
          onChange={(e) => setDentistValue(e.target.value)}
          placeholder="Search by name"
          className="mt-1.5"
        />
      </div>
      <div className="w-full sm:w-36">
        <Label htmlFor="legacy-year">Year</Label>
        <select
          id="legacy-year"
          value={yearValue}
          onChange={(e) => setYearValue(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-(--color-brand)"
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit">Filter</Button>
        {(dentist || year) && (
          <Button type="button" variant="outline" onClick={clear}>
            Clear
          </Button>
        )}
      </div>
    </form>
  );
}
