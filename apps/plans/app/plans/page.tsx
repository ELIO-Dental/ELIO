import { can, requireLicensedSession } from "@/lib/session";
import type { Role } from "@elio/db";
import { listPlans } from "@/lib/plans-service";
import {
  PageContent,
  PageHeader,
  TablePanel,
  TableToolbar,
  TablePagination,
  parseTablePage,
} from "@elio/ui";
import { PlansManager, type PlanRow } from "./plans-manager";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireLicensedSession();
  const canEdit = can({ role: session.role as Role }, "plans:edit");
  const { page, skip, pageSize } = parseTablePage(await searchParams);

  const allPlans = await listPlans(session.practiceId);
  const totalCount = allPlans.length;
  const pagePlans = allPlans.slice(skip, skip + pageSize);

  const plans: PlanRow[] = pagePlans.map((p) => ({
    id: p.id,
    name: p.name,
    monthlyPricePence: p.monthlyPricePence,
    active: p.active,
    eligibilityDentalFit: p.eligibilityDentalFit,
    requiresAdultMembership: p.requiresAdultMembership,
    description: p.description,
    publicDescription: p.publicDescription,
    gocardlessLink: p.gocardlessLink,
    inclusions: p.inclusions.map((inc) => ({
      name: inc.name,
      quantity: inc.quantity,
      period: inc.period,
      description: inc.description,
      sortOrder: inc.sortOrder,
    })),
    discounts: p.discounts.map((disc) => ({
      name: disc.name,
      percentage: Number(disc.percentage),
      applicableTo: disc.applicableTo,
      excludes: disc.excludes,
      description: disc.description,
      sortOrder: disc.sortOrder,
    })),
    eligibilityRules: p.eligibilityRules.map((rule) => ({
      ruleType: rule.ruleType,
      ruleValue: rule.ruleValue,
      description: rule.description,
      active: rule.active,
      sortOrder: rule.sortOrder,
    })),
    memberCount: p._count.patientPlanEnrolments,
  }));

  return (
    <PageContent>
      <PageHeader title="Plans" description="Membership plan models patients can enrol on." />

      <div className="mt-8">
        <TablePanel
          toolbar={<TableToolbar title="Plan models" />}
          footer={<TablePagination page={page} pageSize={pageSize} totalCount={totalCount} />}
        >
          <PlansManager plans={plans} canEdit={canEdit} />
        </TablePanel>
      </div>
    </PageContent>
  );
}
