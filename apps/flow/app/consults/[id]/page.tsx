import { redirect, notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { FlowNav } from "@/components/flow-nav";
import { prisma } from "@elio/db";
import { findLinkableAppointments } from "@/lib/flow-service";
import { ConsultDetailClient } from "./consult-detail-client";

export default async function ConsultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const practiceId = session.practiceId;

  const consult = await prisma.consult.findFirst({
    where: { id, practiceId },
    include: {
      enquiry: { include: { patient: true } },
      practitionerDentist: true,
      appointment: true,
      reminders: { orderBy: { dueAt: "asc" } },
    },
  });
  if (!consult) notFound();

  const [dentists, linkableAppointments] = await Promise.all([
    prisma.dentist.findMany({ where: { practiceId }, orderBy: { name: "asc" } }),
    consult.enquiry.patientId
      ? findLinkableAppointments(practiceId, consult.enquiry.patientId)
      : Promise.resolve([]),
  ]);

  const patient = consult.enquiry.patient;
  const patientName = patient
    ? [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Unnamed patient"
    : "Unlinked lead";

  return (
    <div>
      <FlowNav />
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-h2 text-[--color-text-primary]">{patientName}</h1>
        <p className="mt-1 text-body text-[--color-text-secondary]">
          {consult.enquiry.source ?? "Source unknown"} · captured{" "}
          {consult.enquiry.capturedAt.toLocaleDateString("en-GB")}
        </p>

        <div className="mt-6">
          <ConsultDetailClient
            consult={{
              id: consult.id,
              quotePence: consult.quotePence,
              quotePenceOverride: consult.quotePenceOverride,
              hasDeposit: consult.hasDeposit,
              treatmentBooked: consult.treatmentBooked,
              practitionerDentistId: consult.practitionerDentistId,
              notes: consult.notes,
              outcome: consult.outcome,
              stuckReason: consult.stuckReason,
              totalPaidPence: consult.totalPaidPence,
              attended: consult.attended,
              appointmentId: consult.appointmentId,
              appointment: consult.appointment
                ? {
                    id: consult.appointment.id,
                    startsAt: consult.appointment.startsAt ? consult.appointment.startsAt.toISOString() : null,
                    reason: consult.appointment.reason,
                    dentallyState: consult.appointment.dentallyState,
                  }
                : null,
            }}
            dentists={dentists.map((d) => ({ id: d.id, name: d.name }))}
            hasLinkedPatient={Boolean(consult.enquiry.patientId)}
            linkableAppointments={linkableAppointments.map((a) => ({
              id: a.id,
              startsAt: a.startsAt ? a.startsAt.toISOString() : null,
              reason: a.reason,
              dentallyState: a.dentallyState,
            }))}
            reminders={consult.reminders.map((r) => ({
              id: r.id,
              dueAt: r.dueAt.toISOString(),
              sentAt: r.sentAt ? r.sentAt.toISOString() : null,
              channel: r.channel,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
