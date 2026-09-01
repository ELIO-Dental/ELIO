"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatMoneyGBPOrDash } from "@elio/ui";
import { dentistInitials as initialsFromName, formatPayslipAccordionSubtitle } from "@/lib/payslip-accordion-format";

interface AccordionContextValue {
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordion(): AccordionContextValue {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error("PayslipAccordionItem must be used within PayslipAccordion");
  return ctx;
}

function dentistInitials(name: string): string {
  return initialsFromName(name);
}

export interface PayslipAccordionHeader {
  id: string;
  dentistName: string;
  privateSplitPercent: string | null;
  isNhs: boolean;
  patientCount: number;
  finalPayPence: number | null;
  pdfHref: string;
}

/** Single-expand payslip list (legacy Y2.3). */
export function PayslipAccordion({ children, className }: { children: ReactNode; className?: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <AccordionContext.Provider value={{ expandedId, setExpandedId }}>
      <div className={className ? `${className} flex flex-col gap-3` : "flex flex-col gap-3"}>{children}</div>
    </AccordionContext.Provider>
  );
}

export function PayslipAccordionItem({
  header,
  children,
}: {
  header: PayslipAccordionHeader;
  children: ReactNode;
}) {
  const { expandedId, setExpandedId } = useAccordion();
  const expanded = expandedId === header.id;

  const subtitle = formatPayslipAccordionSubtitle({
    privateSplitPercent: header.privateSplitPercent,
    isNhs: header.isNhs,
    patientCount: header.patientCount,
  });

  return (
    <div
      className="overflow-hidden rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface)"
      data-testid={`payslip-accordion-${header.id}`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-(--color-surface-dim)"
        aria-expanded={expanded}
        data-testid={`payslip-accordion-toggle-${header.id}`}
        onClick={() => setExpandedId(expanded ? null : header.id)}
      >
        <div className="flex min-w-0 items-center gap-4">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--color-brand)/10 text-caption font-bold text-(--color-brand)"
            aria-hidden
          >
            {dentistInitials(header.dentistName)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-(--color-text-primary)">{header.dentistName}</p>
            <p className="mt-0.5 text-caption text-(--color-text-secondary)">
              {subtitle || "—"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <p className="text-money font-bold tabular-nums text-(--color-text-primary)">
              {formatMoneyGBPOrDash(header.finalPayPence)}
            </p>
            <p className="text-caption text-(--color-text-tertiary)">Net pay</p>
          </div>
          <a
            href={header.pdfHref}
            className="hidden text-body-sm font-medium text-(--color-brand) underline underline-offset-2 sm:inline"
            onClick={(e) => e.stopPropagation()}
          >
            PDF
          </a>
          {expanded ? (
            <ChevronUp className="size-[18px] text-(--color-text-tertiary)" aria-hidden />
          ) : (
            <ChevronDown className="size-[18px] text-(--color-text-tertiary)" aria-hidden />
          )}
        </div>
      </button>
      {expanded ? children : null}
    </div>
  );
}
