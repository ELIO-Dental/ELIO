import Link from "next/link";
import { listTenants } from "@/lib/admin-service";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge, Card, CardHeader, CardTitle } from "@elio/ui";

/** Step 2.3, §11.2 — the console's main landing view. Every tenant, at a
 * glance: plan, active licences, user count, Dentally status, trial/
 * onboarding/support status. */
export default async function TenantListPage() {
  const tenants = await listTenants();

  return (
    <div>
      <h1 className="text-h2 text-(--color-text-primary)">Tenants</h1>
      <p className="mt-1 text-body-sm text-(--color-text-secondary)">{tenants.length} practice{tenants.length === 1 ? "" : "s"} on the platform.</p>

      <Card className="mt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Practice</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Licences</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Dentally</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Link href={`/tenants/${t.id}`} className="font-medium text-(--color-primary-600) hover:underline" data-testid={`tenant-link-${t.id}`}>
                    {t.name}
                  </Link>
                </TableCell>
                <TableCell>{t.plan ?? "—"}</TableCell>
                <TableCell>
                  {t.licences.filter((l) => l.active).length > 0
                    ? t.licences.filter((l) => l.active).map((l) => l.moduleId).join(", ")
                    : "None"}
                </TableCell>
                <TableCell>{t._count.users}</TableCell>
                <TableCell>
                  <Badge variant={t.dentallyConnectionStatus === "CONNECTED" ? "success" : t.dentallyConnectionStatus === "ERROR" ? "danger" : "neutral"}>
                    {t.dentallyConnectionStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  {t.suspendedAt ? (
                    <Badge variant="danger" data-testid={`tenant-status-${t.id}`}>Suspended</Badge>
                  ) : (
                    <Badge variant="success" data-testid={`tenant-status-${t.id}`}>Active</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
