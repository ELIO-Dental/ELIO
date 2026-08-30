import { requireSession, redirectToLogin } from "@/lib/session";
import { prisma } from "@elio/db";
import { EmptyState, PageContent, PageHeader, TablePanel, TableToolbar } from "@elio/ui";
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
    <PageContent>
      <PageHeader title="Reminders" description="Outstanding follow-ups, soonest due first." />

      <div className="mt-8">
        <ScheduleReminderForm
            consults={openConsults.map((c) => ({
              id: c.id,
              patientName: patientName(c.enquiry.patient),
            }))}
          />
        </div>

        <div className="mt-8">
          {rows.length === 0 ? (
            <TablePanel toolbar={<TableToolbar title="Outstanding reminders" />}>
              <EmptyState title="No outstanding reminders" description="Scheduled follow-ups awaiting contact will appear here." className="py-12" />
            </TablePanel>
          ) : (
            <RemindersList initialRows={rows} />
          )}
        </div>
    </PageContent>
  );
}

function patientName(patient: { firstName: string | null; lastName: string | null } | null) {
  if (!patient) return "Unlinked lead";
  return [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Unnamed patient";
}
