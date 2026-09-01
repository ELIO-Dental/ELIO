import { Card, CardContent } from "@elio/ui";

/** Static DD collection schedule reminder (P3.5). */
export function PaymentScheduleCard() {
  return (
    <Card accentColor="var(--color-primary-500)">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h3 className="text-body font-semibold text-(--color-text-primary)">Next collection date</h3>
          <p className="mt-1 text-body-sm text-(--color-text-secondary)">
            Direct Debit collections are scheduled for the 1st of each month. Retry date: 11th if the initial
            collection fails.
          </p>
        </div>
        <div className="text-right">
          <p className="font-(--font-mono) text-h2 font-semibold text-(--color-text-primary)">1st</p>
          <p className="text-body-sm text-(--color-text-tertiary)">of next month</p>
        </div>
      </CardContent>
    </Card>
  );
}
