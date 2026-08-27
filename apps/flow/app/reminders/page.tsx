import { requireSession, redirectToLogin } from "@/lib/session";
import { FlowNav } from "@/components/flow-nav";
import { prisma } from "@elio/db";
import { EmptyState } from "@elio/ui";
import { RemindersList, type ReminderRow } from "./reminders-list";
import { ScheduleReminderForm } from "./schedule-reminder-form";

export default async function RemindersPage() {
  const session = await requireSession();
  if (!session) return redirectToLogin();
  const practiceId = session.practiceId;

  const [reminders, openConsults] = await Promise.all([
    prisma.reminder.findMany({
      where: { practiceId, sentAt: null },
      include: { consult: { include: { enquiry: { include: { patient: true } } } } },
      orderBy: { dueAt: "asc" },
    }),
    prisma.consult.findMany({
      where: { practiceId, outcome: { not: "DECLINED" } },
      include: { enquiry: { include: { patient: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const rows: ReminderRow[] = reminders.map((r) => ({
    id: r.id,
    dueAt: r.dueAt.toISOString(),
    channel: r.channel,
    consultId: r.consultId,
    patientName: patientName(r.consult.enquiry.patient),
  }));

  return (
    <div>
      <FlowNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-(--color-text-primary)">Reminders</h1>
        <p className="mt-1 text-body text-(--color-text-secondary)">
          Outstanding follow-ups, soonest due first.
        </p>

        <div className="mt-6">
          <ScheduleReminderForm
            consults={openConsults.map((c) => ({
              id: c.id,
              patientName: patientName(c.enquiry.patient),
            }))}
          />
        </div>

        <div className="mt-8">
          {rows.length === 0 ? (
            <div className="rounded-(--radius-lg) border border-(--color-border)">
              <EmptyState title="No outstanding reminders" description="Scheduled follow-ups awaiting contact will appear here." />
            </div>
          ) : (
            <RemindersList initialRows={rows} />
          )}
        </div>
      </div>
    </div>
  );
}

function patientName(patient: { firstName: string | null; lastName: string | null } | null) {
  if (!patient) return "Unlinked lead";
  return [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Unnamed patient";
}
