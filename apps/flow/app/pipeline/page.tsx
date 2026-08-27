import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { FlowNav } from "@/components/flow-nav";
import { listPipeline } from "@/lib/flow-service";
import { PipelineEmptyState } from "@/components/pipeline-empty-state";
import { PipelineBoard, type PipelineData } from "./pipeline-board";

export default async function PipelinePage() {
  const session = await requireSession();
  if (!session) redirect("/login");

  const columns = await listPipeline(session.practiceId);

  const isEmpty =
    columns.capture.length === 0 &&
    columns.consult_quote.length === 0 &&
    columns.thinking.length === 0 &&
    columns.reminders.length === 0 &&
    columns.closed.length === 0;

  // Serialize to plain, JSON-safe shapes for the client board component
  // (Dates -> ISO strings) — a Server Component can't pass Prisma model
  // instances with Date fields straight to a "use client" child as props
  // without going through JSON-serializable data.
  const data: PipelineData = {
    capture: columns.capture.map((e) => ({
      id: e.id,
      kind: "enquiry" as const,
      patientName: patientName(e.patient),
      source: e.source,
      capturedAt: e.capturedAt.toISOString(),
    })),
    consult_quote: columns.consult_quote.map(consultCard),
    thinking: columns.thinking.map(consultCard),
    reminders: columns.reminders.map(consultCard),
    closed: columns.closed.map(consultCard),
  };

  return (
    <div>
      <FlowNav />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-h2 text-[--color-text-primary]">Pipeline</h1>
        <p className="mt-1 text-body text-[--color-text-secondary]">
          Enquiry-to-consult funnel. Drag a card to move it between stages.
        </p>

        <div className="mt-8">
          {isEmpty ? (
            <PipelineEmptyState
              title="No enquiries yet"
              description="New leads captured for this practice will appear here as cards you can move through the funnel."
            />
          ) : (
            <PipelineBoard initialData={data} />
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

function consultCard(c: {
  id: string;
  quotePence: number | null;
  quotePenceOverride: number | null;
  practitionerDentist: { name: string } | null;
  createdAt: Date;
  outcome: string | null;
  planSignedUp: boolean;
  enquiry: { patient: { id: string; firstName: string | null; lastName: string | null } | null };
}) {
  const daysSince = Math.floor((Date.now() - c.createdAt.getTime()) / 86_400_000);
  return {
    id: c.id,
    kind: "consult" as const,
    patientName: patientName(c.enquiry.patient),
    patientId: c.enquiry.patient?.id ?? null,
    quotePence: c.quotePenceOverride ?? c.quotePence,
    practitionerName: c.practitionerDentist?.name ?? null,
    daysSinceConsult: daysSince,
    outcome: c.outcome,
    planSignedUp: c.planSignedUp,
  };
}
