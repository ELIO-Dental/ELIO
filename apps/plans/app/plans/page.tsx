import { requireLicensedSession } from "@/lib/session";
import { listPlans } from "@/lib/plans-service";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState, Badge } from "@elio/ui";
import { PlansNav } from "@/components/plans-nav";
import { NewPlanForm } from "./new-plan-form";

function money(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PlansPage() {
  const session = await requireLicensedSession();

  const plans = await listPlans(session.practiceId);

  return (
    <div>
      <PlansNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-[--color-text-primary]">Plans</h1>
        <p className="mt-1 text-body text-[--color-text-secondary]">Membership plan models patients can enrol on.</p>

        <div className="mt-6">
          <NewPlanForm />
        </div>

        <div className="mt-8">
          {plans.length === 0 ? (
            <EmptyState title="No plans yet" description="Add your first plan above." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Monthly price</TableHead>
                  <TableHead>Inclusions</TableHead>
                  <TableHead>Discounts</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell>{money(p.monthlyPricePence)}</TableCell>
                    <TableCell>{p.inclusions.length}</TableCell>
                    <TableCell>{p.discounts.length}</TableCell>
                    <TableCell>
                      <Badge variant={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
