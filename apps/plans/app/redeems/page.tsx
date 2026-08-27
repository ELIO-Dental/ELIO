import { requireLicensedSession } from "@/lib/session";
import { PlansNav } from "@/components/plans-nav";
import { listRedeems } from "@/lib/plans-service";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState, Badge } from "@elio/ui";
import { RedeemActions } from "./redeem-actions";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  PARTIALLY_EARNED: "info",
};

export default async function RedeemsPage() {
  const session = await requireLicensedSession();

  const redeems = await listRedeems(session.practiceId);

  return (
    <div>
      <PlansNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-(--color-text-primary)">Redeems</h1>
        <p className="mt-1 text-body text-(--color-text-secondary)">
          Benefit redemption requests. Approving or rejecting a pending redeem is recorded in
          the audit log.
        </p>

        <div className="mt-8">
          {redeems.length === 0 ? (
            <div className="rounded-(--radius-lg) border border-(--color-border)">
              <EmptyState title="No redeems yet" description="Redemption requests will appear here." />
            </div>
          ) : (
            <div className="rounded-(--radius-lg) border border-(--color-border)">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {redeems.map((r) => {
                    const name =
                      [r.planPatient.patient.firstName, r.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                      "Unknown patient";
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{name}</TableCell>
                        <TableCell>
                          {r.itemName}
                          <span className="ml-2 text-body-sm text-(--color-text-tertiary)">{r.itemType}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[r.status] ?? "neutral"}>{r.status}</Badge>
                        </TableCell>
                        <TableCell className="text-(--color-text-tertiary)">
                          {r.createdAt.toISOString().slice(0, 10)}
                        </TableCell>
                        <TableCell>
                          {r.status === "PENDING_APPROVAL" ? (
                            <RedeemActions redeemId={r.id} />
                          ) : (
                            <span className="text-body-sm text-(--color-text-tertiary)">
                              {r.status === "APPROVED" ? "Approved" : r.status === "REJECTED" ? "Rejected" : "—"}
                            </span>
                          )}
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
