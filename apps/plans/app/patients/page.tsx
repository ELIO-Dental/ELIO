import { requireLicensedSession } from "@/lib/session";
import { prisma } from "@elio/db";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState, Badge } from "@elio/ui";
import { PlansNav } from "@/components/plans-nav";
import { FilterBar } from "@/components/filter-bar";
import { EnrolPatientForm } from "./enrol-patient-form";

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
  searchParams: Promise<{ q?: string; status?: string; patientId?: string; fromFlow?: string }>;
}) {
  const session = await requireLicensedSession();
  const practiceId = session.practiceId;

  const { q, status, patientId: prefillPatientId } = await searchParams;

  const [planPatients, enrolledPatientIds, corePatients, plans] = await Promise.all([
    prisma.planPatient.findMany({
      where: {
        practiceId,
        ...(status ? { status: status as "INVITED" | "SIGNED" | "ACTIVE" | "PAUSED" | "CANCELLED" } : {}),
        ...(q
          ? {
              patient: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      include: {
        patient: true,
        planModel: { select: { name: true } },
        patientPlans: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.planPatient.findMany({ where: { practiceId }, select: { patientId: true } }),
    prisma.patient.findMany({ where: { practiceId }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.planModel.findMany({ where: { practiceId, isCurrentVersion: true, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const enrolledIds = new Set(enrolledPatientIds.map((p) => p.patientId));
  const unenrolledPatients = corePatients.filter((p) => !enrolledIds.has(p.id));

  return (
    <div>
      <PlansNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-[--color-text-primary]">Patients</h1>
        <p className="mt-1 text-body text-[--color-text-secondary]">
          Patients enrolled on a membership plan.
        </p>

        <div className="mt-6">
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
          <FilterBar />
          {planPatients.length === 0 ? (
            <div className="rounded-b-[--radius-lg] border border-t-0 border-[--color-border]">
              <EmptyState
                title="No patients match"
                description="Enrol a patient above, or clear your filters."
              />
            </div>
          ) : (
            <div className="rounded-b-[--radius-lg] border border-t-0 border-[--color-border]">
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
                        <TableCell>{name}</TableCell>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
