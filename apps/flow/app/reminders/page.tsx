import { PageContent, PageHeader } from "@elio/ui";
import type { Role } from "@elio/db";
import { requireSession, redirectToLogin, resolveFlowScope } from "@/lib/session";
import { listOutstandingReminders, listPipeline } from "@/lib/flow-service";
import { RemindersList } from "./reminders-list";
import { ScheduleReminderForm } from "./schedule-reminder-form";

function patientNameFor(consult: { enquiry: { patient: { firstName: string | null; lastName: string | null } | null } }) {
  const patient = consult.enquiry.patient;
  return patient ? [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Unnamed patient" : "Unlinked patient";
}

/**
 * FR-F1 (00_SCOPE.md §5) — "smart reminders until closed" is required scope,
 * not optional: every non-closed consult can get a scheduled follow-up, and
 * outstanding ones surface here until marked sent. The classic ElioFlow app
 * never had this as a standalone tab (touch points lived on the home table),
 * but the new build guide (MASTER_BUILD_GUIDE.md §8) explicitly calls for a
 * dedicated Reminders stage in the pipeline — this page was fully built
 * (API, list, form) but left dead-ended behind a redirect; wiring it in here.
 */
export default async function RemindersPage() {
  const session = await requireSession();
  if (!session) return redirectToLogin();

  const scope = await resolveFlowScope({
    userId: session.userId,
    practiceId: session.practiceId,
    role: session.role as Role,
    permissions: session.permissions ?? [],
  });

  const [reminders, pipeline] = await Promise.all([
    listOutstandingReminders(session.practiceId, scope),
    listPipeline(session.practiceId, scope),
  ]);

  const openConsults = [...pipeline.consult_quote, ...pipeline.thinking, ...pipeline.reminders].map((c) => ({
    id: c.id,
    patientName: patientNameFor(c),
  }));

  return (
    <PageContent>
      <PageHeader
        title="Reminders"
        description="Follow-ups scheduled for open consults, oldest due first — mark one sent once you've made contact."
      />
      <div className="mt-6 flex flex-col gap-6 sm:mt-8">
        <ScheduleReminderForm consults={openConsults} />
        <RemindersList initialRows={reminders} />
      </div>
    </PageContent>
  );
}
