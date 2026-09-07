"use client";

import { useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableCellMoney,
  TableHead,
  TableHeader,
  TablePanel,
  TableRow,
  formatMoneyGBPOrDash,
} from "@elio/ui";
import { therapyDeductionPence } from "@/lib/private-revenue";
import { formatDecimalLabel } from "@/lib/period-payslip-summary";
import { parsePayslipAdjustments } from "@/lib/payslip-editable-fields";
import { resolveFinanceFeesForDeduction } from "@/lib/finance-fee";
import { DentistFetchDetails } from "./dentist-fetch-details";
import { NhsPeriodBanner } from "./nhs-period-banner";
import { PayslipEditableFields, type PayslipEditableFieldsHandle } from "./payslip-editable-fields";
import { PayslipEmailActions } from "./payslip-email-actions";
import { PayslipExpandedSummary } from "./payslip-expanded-summary";

function LockedAdjustmentsList({ adjustmentsJson }: { adjustmentsJson: unknown }) {
  const rows = parsePayslipAdjustments(adjustmentsJson).filter((a) => a.amountPence > 0);
  if (rows.length === 0) return null;
  return (
    <div
      className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) px-4 py-3"
      data-testid="locked-adjustments-list"
    >
      <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-(--color-text-secondary)">
        Manual adjustments
      </p>
      <ul className="space-y-1 text-body-sm">
        {rows.map((a, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2">
            <span>
              {a.type === "deduction" ? "−" : "+"} {a.description}
              {a.createdBy ? (
                <span className="ml-2 text-caption text-(--color-text-tertiary)">
                  ({a.createdBy}
                  {a.createdAt ? ` · ${a.createdAt.slice(0, 10)}` : ""})
                </span>
              ) : null}
            </span>
            <span className="tabular-nums font-medium">
              {a.type === "deduction" ? "−" : "+"}
              {formatMoneyGBPOrDash(a.amountPence)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function asAnalytics(value: unknown): {
  totalChairMins?: number;
  totalPatients?: number;
  grossPerHour?: number;
  netPerHour?: number;
  avgAppointmentMins?: number;
  utilizationPercent?: number;
  topPatientsByHourlyRate?: Array<{ name: string; durationMins: number; hourlyRate: number }>;
  topTreatmentsByHourlyRate?: Array<{ treatment: string; count: number; hourlyRate: number }>;
} | null {
  if (!value || typeof value !== "object") return null;
  return value as {
    totalChairMins?: number;
    totalPatients?: number;
    grossPerHour?: number;
    netPerHour?: number;
    avgAppointmentMins?: number;
    utilizationPercent?: number;
    topPatientsByHourlyRate?: Array<{ name: string; durationMins: number; hourlyRate: number }>;
    topTreatmentsByHourlyRate?: Array<{ treatment: string; count: number; hourlyRate: number }>;
  };
}

export interface PayslipEntryBodyProps {
  payPeriodId: string;
  payslipEntryId: string;
  dentistName: string;
  dentistEmail: string | null;
  locked: boolean;
  isNhs?: boolean;
  nhsPeriodStart?: string | null;
  nhsPeriodEnd?: string | null;
  payType: string;
  udas: { toString(): string } | null;
  udaRatePence: number | null;
  nhsEarningsPence: number | null;
  grossPrivateRevenuePence: number | null;
  privateSplitPercent: { toString(): string } | null;
  privateEarningsPence: number | null;
  consultationExclusionsPence: number | null;
  labDeductionPence: number | null;
  superannuationPence: number | null;
  therapyMinutes: number | null;
  therapyRatePerMinute: number | null;
  therapyHourlyPence?: number | null;
  hoursWorked: { toString(): string } | null;
  hourlyRatePence: number | null;
  hourlyEarningsPence: number | null;
  manualAdjustmentsPence: number | null;
  adjustmentReason: string | null;
  finalPayPence: number | null;
  dentallyAnalyticsJson: unknown;
  dentallyDiscrepanciesJson: unknown;
  dentallyDentistLogJson: unknown;
  labBillsJson: unknown;
  adjustmentsJson: unknown;
  provisional?: boolean;
  financeRates: {
    finance_rate_3m: string;
    finance_rate_12m: string;
    finance_rate_36m: string;
    finance_rate_60m: string;
  };
  /** Dentist/practice finance share in basis points (Step 21/24). */
  financeFeeSplit?: number;
  /** Precomputed finance deduction for figure table (matches period summary). */
  financeFeesDeductionPence?: number;
  privateRevenueLineItems: Array<{
    id: string;
    patientName: string | null;
    invoiceDate: string | null;
    amountPence: number;
    amountPaidPence: number | null;
    amountOutstandingPence: number | null;
    paymentStatus: string | null;
    durationMins: number | null;
    hourlyRatePence: number | null;
    isFinance: boolean;
    flagged: boolean;
    flagReason: string | null;
    treatmentDescription: string | null;
    financeFeePence: number | null;
    financeTermMonths: number | null;
    financeFeeManual: boolean;
    dentallyInvoiceId?: string | null;
    dentallyLineKey?: string | null;
    sourceType?: string | null;
    manualCreatedByUserId?: string | null;
    manualNote?: string | null;
    createdAt?: string | Date | null;
  }>;
}

/** Expanded payslip figures and Dentally patient lines (Y2.3 body). */
export function PayslipEntryBody(props: PayslipEntryBodyProps) {
  const p = props;
  const fieldsRef = useRef<PayslipEditableFieldsHandle>(null);
  const [saving, setSaving] = useState(false);
  const showEditable = p.payType === "PERCENTAGE_SPLIT" || p.payType === "HOURLY";

  async function handleSave() {
    setSaving(true);
    try {
      await fieldsRef.current?.save();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-(--color-border-subtle) bg-(--color-surface-dim) px-5 py-5 space-y-6">
      {p.provisional ? (
        <div
          className="rounded-(--radius-md) border border-(--color-warning)/40 bg-(--color-warning)/10 px-4 py-3 text-body-sm text-(--color-warning)"
          data-testid="provisional-banner"
        >
          <strong className="font-semibold">PROVISIONAL</strong>
          {" — "}
          One or more finance (Tabeo) lines still need a term and/or fee. Default 12m rate is used for deductions until ops confirms.
        </div>
      ) : null}
      {p.isNhs && p.nhsPeriodStart && p.nhsPeriodEnd ? (
        <NhsPeriodBanner
          periodStart={p.nhsPeriodStart}
          periodEnd={p.nhsPeriodEnd}
          udas={p.udas != null ? formatDecimalLabel(p.udas) : null}
          udaRatePence={p.udaRatePence}
        />
      ) : null}
      {p.payType === "PERCENTAGE_SPLIT" ? (
        <PayslipExpandedSummary
          grossPrivateRevenuePence={p.grossPrivateRevenuePence}
          privateEarningsPence={p.privateEarningsPence}
          nhsEarningsPence={p.nhsEarningsPence}
          labDeductionPence={p.labDeductionPence}
          superannuationPence={p.superannuationPence}
          therapyMinutes={p.therapyMinutes}
          therapyRatePerMinute={p.therapyRatePerMinute}
          therapyHourlyPence={p.therapyHourlyPence}
          financeLines={resolveFinanceFeesForDeduction(p.privateRevenueLineItems, p.financeRates)}
          financeFeeSplit={p.financeFeeSplit}
          labBillsJson={p.labBillsJson}
        />
      ) : null}
      {/* AuraPay order: income fields (gross/finance/therapy rate/super) before patients */}
      {showEditable ? (
        <PayslipEditableFields
          ref={fieldsRef}
          payPeriodId={p.payPeriodId}
          payslipEntryId={p.payslipEntryId}
          locked={p.locked}
          isNhs={Boolean(p.isNhs)}
          hasPatientLines={p.privateRevenueLineItems.length > 0}
          udas={p.udas != null ? formatDecimalLabel(p.udas) : null}
          udaRatePence={p.udaRatePence}
          therapyMinutes={p.therapyMinutes}
          therapyRatePerMinute={p.therapyRatePerMinute}
          superannuationPence={p.superannuationPence}
          grossPrivateRevenuePence={p.grossPrivateRevenuePence}
          financeFeesPence={
            p.privateRevenueLineItems.reduce((sum, line) => sum + (line.financeFeePence ?? 0), 0) || null
          }
          adjustmentReason={p.adjustmentReason}
          labBillsJson={p.labBillsJson}
          adjustmentsJson={p.adjustmentsJson}
        />
      ) : null}
      <TablePanel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Figure</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.payType === "PERCENTAGE_SPLIT" ? (
              <>
                <TableRow>
                  <TableCell>UDAs</TableCell>
                  <TableCellMoney>{formatDecimalLabel(p.udas)}</TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>UDA rate</TableCell>
                  <TableCellMoney>{formatMoneyGBPOrDash(p.udaRatePence)}</TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>NHS earnings</TableCell>
                  <TableCellMoney>{formatMoneyGBPOrDash(p.nhsEarningsPence)}</TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>Gross private revenue</TableCell>
                  <TableCellMoney>{formatMoneyGBPOrDash(p.grossPrivateRevenuePence)}</TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>Private split %</TableCell>
                  <TableCellMoney>{formatDecimalLabel(p.privateSplitPercent, "%")}</TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>Private earnings</TableCell>
                  <TableCellMoney>{formatMoneyGBPOrDash(p.privateEarningsPence)}</TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>Consultation exclusions</TableCell>
                  <TableCellMoney>{formatMoneyGBPOrDash(p.consultationExclusionsPence)}</TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>Lab deduction</TableCell>
                  <TableCellMoney>-{formatMoneyGBPOrDash(p.labDeductionPence)}</TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>Finance deduction</TableCell>
                  <TableCellMoney>
                    -{formatMoneyGBPOrDash(p.financeFeesDeductionPence ?? 0)}
                  </TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>Therapy minutes</TableCell>
                  <TableCellMoney>{p.therapyMinutes ?? 0}</TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>Rate per minute</TableCell>
                  <TableCellMoney>
                    £
                    {(p.therapyRatePerMinute != null && p.therapyRatePerMinute > 0
                      ? p.therapyRatePerMinute
                      : 0.5833
                    ).toFixed(4)}
                  </TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>
                    Therapy deduction
                    {p.therapyMinutes != null && p.therapyMinutes > 0
                      ? ` (${p.therapyMinutes} mins)`
                      : ""}
                  </TableCell>
                  <TableCellMoney>
                    -{formatMoneyGBPOrDash(
                      therapyDeductionPence(p.therapyMinutes, p.therapyRatePerMinute, p.therapyHourlyPence)
                    )}
                  </TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>Superannuation</TableCell>
                  <TableCellMoney>-{formatMoneyGBPOrDash(p.superannuationPence)}</TableCellMoney>
                </TableRow>
              </>
            ) : (
              <>
                <TableRow>
                  <TableCell>Hours worked</TableCell>
                  <TableCellMoney>{p.hoursWorked?.toString() ?? "—"}</TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>Hourly rate</TableCell>
                  <TableCellMoney>{formatMoneyGBPOrDash(p.hourlyRatePence)}</TableCellMoney>
                </TableRow>
                <TableRow>
                  <TableCell>Hourly earnings</TableCell>
                  <TableCellMoney>{formatMoneyGBPOrDash(p.hourlyEarningsPence)}</TableCellMoney>
                </TableRow>
              </>
            )}
            <TableRow>
              <TableCell>Adjustments</TableCell>
              <TableCellMoney>{formatMoneyGBPOrDash(p.manualAdjustmentsPence)}</TableCellMoney>
            </TableRow>
            <TableRow>
              <TableCell className="font-semibold">Net Pay</TableCell>
              <TableCellMoney className="font-semibold">{formatMoneyGBPOrDash(p.finalPayPence)}</TableCellMoney>
            </TableRow>
          </TableBody>
        </Table>
      </TablePanel>
      {p.locked ? (
        <LockedAdjustmentsList adjustmentsJson={p.adjustmentsJson} />
      ) : null}
      <div className="mt-6">
        <DentistFetchDetails
          payPeriodId={p.payPeriodId}
          payslipEntryId={p.payslipEntryId}
          dentistName={p.dentistName}
          locked={p.locked}
          privateSplitPercent={p.privateSplitPercent?.toString() ?? null}
          analytics={asAnalytics(p.dentallyAnalyticsJson)}
          lines={p.privateRevenueLineItems}
          dentallyDiscrepanciesJson={p.dentallyDiscrepanciesJson}
          dentallyDentistLogJson={p.dentallyDentistLogJson}
          financeRates={p.financeRates}
        />
      </div>
      <PayslipEmailActions
        payslipEntryId={p.payslipEntryId}
        dentistEmail={p.dentistEmail}
        pdfHref={`/pay/api/payslips/${p.payslipEntryId}/pdf`}
        provisional={p.provisional}
        showSave={showEditable && !p.locked}
        saving={saving}
        onSave={() => void handleSave()}
      />
    </div>
  );
}
