import Link from "next/link";
import { can, requireLicensedSession } from "@/lib/session";
import { prisma, type Role } from "@elio/db";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
  Badge,
  PageContent,
  PageHeader,
  TablePanel,
  TableToolbar,
  TablePagination,
  parseTablePage,
} from "@elio/ui";
import { FilterBar } from "@/components/filter-bar";
import { PatientsDentallyTools } from "./patients-dentally-tools";
import { PatientsListToolbar } from "./patients-list-toolbar";
import { PatientsEnrolSection } from "./patients-enrol-section";
import { PatientRowActions } from "./patient-row-actions";
import { buildPlanPatientListWhere, derivePatientDisplayStatus } from "@/lib/patient-list-filters";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  INVITED: "neutral",
  SIGNED: "info",
  ACTIVE: "success",
  PENDING_DD: "warning",
  PAUSED: "warning",
  CANCELLED: "danger",
};

export const dynamic = "force-dynamic";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; patientId?: string; fromFlow?: string; page?: string; openEnrol?: string }>;
}) {
  const session = await requireLicensedSession();
  const practiceId = session.practiceId;
  const role = session.role as Role;
  const canInvite = can({ role }, "plans:invite-patients");
  const canEdit = can({ role }, "plans:edit");
  const canExport = can({ role }, "plans:view-payments") || can({ role }, "plans:view-payments:readonly");

  const params = await searchParams;
  const { q, status, patientId: prefillPatientId, fromFlow, openEnrol } = params;
  const { page, skip, pageSize } = parseTablePage(params);

  const where = buildPlanPatientListWhere(practiceId, { q, status });

  const [planPatients, totalCount, enrolledPatientIds, corePatients, plans, activeParentMembers] = await Promise.all([
    prisma.planPatient.findMany({
      where,
      include: {
        patient: true,
        planModel: { select: { name: true, monthlyPricePence: true } },
        mandates: { select: { status: true } },
        documentAcceptances: { take: 1, select: { id: true } },
        patientPlans: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: { select: { name: true } } } },
        parentPatient: { include: { patient: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.planPatient.count({ where }),
    prisma.planPatient.findMany({ where: { practiceId }, select: { patientId: true } }),
    prisma.patient.findMany({ where: { practiceId }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.planModel.findMany({ where: { practiceId, isCurrentVersion: true, active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.planPatient.findMany({
      where: { practiceId, status: "ACTIVE" },
      include: { patient: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const parentMembers = activeParentMembers.map((pp) => ({
    id: pp.id,
    firstName: pp.patient.firstName,
    lastName: pp.patient.lastName,
  }));

  const enrolledIds = new Set(enrolledPatientIds.map((p) => p.patientId));
  const unenrolledPatients = corePatients.filter((p) => !enrolledIds.has(p.id));
  const planOptions = plans.map((p) => ({ id: p.id, name: p.name, monthlyPricePence: p.monthlyPricePence }));

  return (
    <PageContent width="full">
      <PageHeader title="Patients" description="Patients enrolled on a membership plan." />

      {fromFlow && (
        <div
          id="enrol-from-flow"
          className="mt-6 rounded-(--radius-md) border border-(--color-info)/40 bg-(--color-info-bg) p-4 text-body-sm text-(--color-text-primary)"
        >
          <p className="font-medium">Continue enrolment from ElioFlow</p>
          <p className="mt-1 text-(--color-text-secondary)">
            {prefillPatientId
              ? "The patient below is pre-selected — choose a plan and enrol to send their signup link."
              : "Choose a patient and plan below to start their membership signup."}
          </p>
        </div>
      )}

      {canInvite && (
        <div className="mt-6">
          <PatientsDentallyTools plans={planOptions} parentMembers={parentMembers} />
        </div>
      )}

      {(canInvite || unenrolledPatients.length > 0) && (
        <PatientsEnrolSection
          canInvite={canInvite}
          plans={planOptions}
          parentMembers={parentMembers}
          unenrolledPatients={unenrolledPatients.map((p) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
          }))}
          initialPatientId={prefillPatientId}
          fromFlow={Boolean(fromFlow)}
          openEnrol={openEnrol === "1" || openEnrol === "true"}
        />
      )}

      <div className="mt-8">
        <TablePanel
          toolbar={
            <TableToolbar>
              <FilterBar />
              <PatientsListToolbar canSync={canInvite} canBulkGc={canEdit} canExport={canExport} />
            </TableToolbar>
          }
          footer={<TablePagination page={page} pageSize={pageSize} totalCount={totalCount} />}
        >
          {planPatients.length === 0 ? (
            <EmptyState
              title="No patients match"
              description="Use Add / Enrol patient above, or clear your filters."
              className="py-12"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>T&amp;Cs</TableHead>
                  <TableHead>Joined</TableHead>
                  {canInvite ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {planPatients.map((pp) => {
                  const name = [pp.patient.firstName, pp.patient.lastName].filter(Boolean).join(" ") || "—";
                  const planName = pp.patientPlans[0]?.plan.name ?? pp.planModel?.name ?? "—";
                  const displayStatus = derivePatientDisplayStatus(pp);
                  const parentName = pp.parentPatient
                    ? [pp.parentPatient.patient.firstName, pp.parentPatient.patient.lastName].filter(Boolean).join(" ")
                    : null;
                  return (
                    <TableRow key={pp.id}>
                      <TableCell>
                        <Link
                          href={`/patients/${pp.id}`}
                          className="font-medium text-(--color-primary-fg) hover:underline"
                        >
                          {name}
                        </Link>
                        {parentName && (
                          <p className="mt-0.5 text-caption text-(--color-text-tertiary)">
                            Child of{" "}
                            <Link href={`/patients/${pp.parentPatient!.id}`} className="text-(--color-primary-fg) hover:underline">
                              {parentName}
                            </Link>
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{pp.patient.email ?? "—"}</TableCell>
                      <TableCell>{planName}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[displayStatus] ?? "neutral"}>{displayStatus}</Badge>
                      </TableCell>
                      <TableCell>{pp.documentAcceptances.length > 0 ? "Signed" : "—"}</TableCell>
                      <TableCell>{pp.createdAt.toLocaleDateString("en-GB")}</TableCell>
                      {canInvite ? (
                        <TableCell className="text-right">
                          <PatientRowActions
                            planPatientId={pp.id}
                            status={displayStatus}
                            hasEmail={Boolean(pp.patient.email?.trim())}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TablePanel>
      </div>
    </PageContent>
  );
}
