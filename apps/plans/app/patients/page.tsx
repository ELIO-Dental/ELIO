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
import { EnrolPatientForm } from "./enrol-patient-form";
import { PatientsDentallyTools } from "./patients-dentally-tools";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  INVITED: "neutral",
  SIGNED: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  CANCELLED: "danger",
};

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; patientId?: string; fromFlow?: string; page?: string }>;
}) {
  const session = await requireLicensedSession();
  const practiceId = session.practiceId;
  const canInvite = can({ role: session.role as Role }, "plans:invite-patients");

  const params = await searchParams;
  const { q, status, patientId: prefillPatientId } = params;
  const { page, skip, pageSize } = parseTablePage(params);

  const where = {
    practiceId,
    ...(status ? { status: status as "INVITED" | "SIGNED" | "ACTIVE" | "PAUSED" | "CANCELLED" } : {}),
    ...(q
      ? {
          patient: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [planPatients, totalCount, enrolledPatientIds, corePatients, plans] = await Promise.all([
    prisma.planPatient.findMany({
      where,
      include: {
        patient: true,
        planModel: { select: { name: true } },
        patientPlans: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.planPatient.count({ where }),
    prisma.planPatient.findMany({ where: { practiceId }, select: { patientId: true } }),
    prisma.patient.findMany({ where: { practiceId }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.planModel.findMany({ where: { practiceId, isCurrentVersion: true, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const enrolledIds = new Set(enrolledPatientIds.map((p) => p.patientId));
  const unenrolledPatients = corePatients.filter((p) => !enrolledIds.has(p.id));

  return (
    <PageContent>
      <PageHeader title="Patients" description="Patients enrolled on a membership plan." />

      {canInvite && (
        <div className="mt-8">
          <PatientsDentallyTools
            plans={plans.map((p) => ({ id: p.id, name: p.name, monthlyPricePence: p.monthlyPricePence }))}
          />
        </div>
      )}

      <div className="mt-8">
        <EnrolPatientForm
          patients={unenrolledPatients.map((p) => ({
            id: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
          }))}
          plans={plans.map((p) => ({ id: p.id, name: p.name, monthlyPricePence: p.monthlyPricePence }))}
          initialPatientId={prefillPatientId}
        />
      </div>

      <div className="mt-8">
        <TablePanel
          toolbar={
            <TableToolbar>
              <FilterBar />
            </TableToolbar>
          }
          footer={<TablePagination page={page} pageSize={pageSize} totalCount={totalCount} />}
        >
          {planPatients.length === 0 ? (
            <EmptyState title="No patients match" description="Enrol a patient above, or clear your filters." className="py-12" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planPatients.map((pp) => {
                  const name = [pp.patient.firstName, pp.patient.lastName].filter(Boolean).join(" ") || "—";
                  const planName = pp.patientPlans[0]?.plan.name ?? pp.planModel?.name ?? "—";
                  return (
                    <TableRow key={pp.id}>
                      <TableCell>
                        <Link
                          href={`/patients/${pp.id}`}
                          className="font-medium text-(--color-primary-fg) hover:underline"
                        >
                          {name}
                        </Link>
                      </TableCell>
                      <TableCell>{pp.patient.email ?? "—"}</TableCell>
                      <TableCell>{planName}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[pp.status] ?? "neutral"}>{pp.status}</Badge>
                      </TableCell>
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
