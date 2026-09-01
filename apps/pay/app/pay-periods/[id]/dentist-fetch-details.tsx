import { formatMoneyGBPOrDash } from "@elio/ui";
import { PrivatePatientsTable, type PrivatePatientRow } from "./private-patients-table";

interface Analytics {
  totalChairMins?: number;
  totalPatients?: number;
  grossPerHour?: number;
  netPerHour?: number;
  avgAppointmentMins?: number;
  utilizationPercent?: number;
  topPatientsByHourlyRate?: Array<{ name: string; durationMins: number; hourlyRate: number }>;
  topTreatmentsByHourlyRate?: Array<{ treatment: string; count: number; hourlyRate: number }>;
}

export function DentistFetchDetails({
  payPeriodId,
  payslipEntryId,
  locked,
  privateSplitPercent,
  analytics,
  lines,
}: {
  payPeriodId: string;
  payslipEntryId: string;
  locked: boolean;
  privateSplitPercent: string | null;
  analytics: Analytics | null;
  lines: PrivatePatientRow[];
}) {
  if (!analytics?.totalChairMins && lines.length === 0) return null;

  const patientsWithDuration = lines.filter((l) => l.durationMins && l.durationMins > 0).length;
  const topPatients = analytics?.topPatientsByHourlyRate ?? [];
  const topTreatments = analytics?.topTreatmentsByHourlyRate ?? [];

  return (
    <div className="space-y-6" data-testid="dentist-fetch-details">
      {analytics?.totalChairMins ? (
        <section className="rounded-(--radius-lg) border border-(--color-brand)/20 bg-(--color-brand)/5 p-4">
          <h3 className="text-body-sm font-semibold text-(--color-brand)">Performance analytics</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <AnalyticsMetric
              label="Chair time"
              value={`${(analytics.totalChairMins / 60).toFixed(1)}h`}
              sub={`${analytics.totalChairMins} mins`}
            />
            <AnalyticsMetric
              label="Utilisation"
              value={`${analytics.utilizationPercent ?? 0}%`}
              sub="of available"
            />
            <AnalyticsMetric
              label="Gross £/hour"
              value={formatMoneyGBPOrDash(Math.round((analytics.grossPerHour ?? 0) * 100))}
              sub="per hour"
              valueClass="text-(--color-success)"
            />
            <AnalyticsMetric
              label="Net £/hour"
              value={formatMoneyGBPOrDash(Math.round((analytics.netPerHour ?? 0) * 100))}
              sub={privateSplitPercent ? `${privateSplitPercent}% split` : "per hour"}
              valueClass="text-(--color-success)"
            />
            <AnalyticsMetric
              label="Avg appt"
              value={`${analytics.avgAppointmentMins ?? 0}m`}
              sub={`${patientsWithDuration} appts`}
            />
          </div>

          {(topPatients.length > 0 || topTreatments.length > 0) && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {topPatients.length > 0 ? (
                <TopList title="Top patients by £/hour" items={topPatients.slice(0, 5).map((p) => ({
                  label: p.name,
                  meta: `${p.durationMins}m`,
                  value: `£${p.hourlyRate.toFixed(0)}/h`,
                }))} />
              ) : null}
              {topTreatments.length > 0 ? (
                <TopList title="Top treatments by £/hour" items={topTreatments.slice(0, 5).map((t) => ({
                  label: t.treatment,
                  meta: `×${t.count}`,
                  value: `£${t.hourlyRate.toFixed(0)}/h`,
                }))} />
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      <PrivatePatientsTable
        payPeriodId={payPeriodId}
        payslipEntryId={payslipEntryId}
        locked={locked}
        initialLines={lines}
      />
    </div>
  );
}

function AnalyticsMetric({
  label,
  value,
  sub,
  valueClass = "text-(--color-text-primary)",
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-(--radius-md) bg-(--color-surface)/80 px-3 py-3 text-center">
      <p className="text-[10px] font-medium uppercase text-(--color-brand)">{label}</p>
      <p className={`mt-1 text-body font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-[10px] text-(--color-text-tertiary)">{sub}</p>
    </div>
  );
}

function TopList({ title, items }: { title: string; items: Array<{ label: string; meta: string; value: string }> }) {
  return (
    <div className="rounded-(--radius-md) bg-(--color-surface)/70 p-3">
      <h4 className="mb-2 text-caption font-semibold text-(--color-brand)">{title}</h4>
      <div className="max-h-32 space-y-1.5 overflow-y-auto">
        {items.map((item, i) => (
          <div key={`${item.label}-${i}`} className="flex items-center justify-between gap-2 text-caption">
            <span className="truncate text-(--color-text-primary)">{item.label}</span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-(--color-text-tertiary)">{item.meta}</span>
              <span className="font-semibold text-(--color-success)">{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
