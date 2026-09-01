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
import { DentistFetchDetails } from "./dentist-fetch-details";
import { PayslipExpandedSummary } from "./payslip-expanded-summary";

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
  locked: boolean;
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
  hoursWorked: { toString(): string } | null;
  hourlyRatePence: number | null;
  hourlyEarningsPence: number | null;
  manualAdjustmentsPence: number | null;
  finalPayPence: number | null;
  dentallyAnalyticsJson: unknown;
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
  }>;
}

/** Expanded payslip figures and Dentally patient lines (Y2.3 body). */
export function PayslipEntryBody(props: PayslipEntryBodyProps) {
  const p = props;

  return (
    <div className="border-t border-(--color-border-subtle) bg-(--color-surface-dim) px-5 py-5 space-y-6">
      {p.payType === "PERCENTAGE_SPLIT" ? (
        <PayslipExpandedSummary
          grossPrivateRevenuePence={p.grossPrivateRevenuePence}
          privateEarningsPence={p.privateEarningsPence}
          nhsEarningsPence={p.nhsEarningsPence}
          labDeductionPence={p.labDeductionPence}
          superannuationPence={p.superannuationPence}
          therapyMinutes={p.therapyMinutes}
          therapyRatePerMinute={p.therapyRatePerMinute}
          financeLines={p.privateRevenueLineItems}
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
                  <TableCellMoney>{p.udas?.toString() ?? "—"}</TableCellMoney>
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
                  <TableCellMoney>{p.privateSplitPercent?.toString() ?? "—"}%</TableCellMoney>
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
                  <TableCell>Superannuation</TableCell>
                  <TableCellMoney>-{formatMoneyGBPOrDash(p.superannuationPence)}</TableCellMoney>
                </TableRow>
                {p.therapyMinutes != null && p.therapyMinutes > 0 ? (
                  <TableRow>
                    <TableCell>
                      Therapy ({p.therapyMinutes} mins
                      {p.therapyRatePerMinute != null ? ` @ £${p.therapyRatePerMinute.toFixed(4)}/min` : ""})
                    </TableCell>
                    <TableCellMoney>
                      -{formatMoneyGBPOrDash(Math.round(p.therapyMinutes * (p.therapyRatePerMinute ?? 0) * 100))}
                    </TableCellMoney>
                  </TableRow>
                ) : null}
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
              <TableCell className="font-semibold">Final pay</TableCell>
              <TableCellMoney className="font-semibold">{formatMoneyGBPOrDash(p.finalPayPence)}</TableCellMoney>
            </TableRow>
          </TableBody>
        </Table>
      </TablePanel>
      <div className="mt-6">
        <DentistFetchDetails
          payPeriodId={p.payPeriodId}
          payslipEntryId={p.payslipEntryId}
          locked={p.locked}
          privateSplitPercent={p.privateSplitPercent?.toString() ?? null}
          analytics={asAnalytics(p.dentallyAnalyticsJson)}
          lines={p.privateRevenueLineItems}
        />
      </div>
    </div>
  );
}
