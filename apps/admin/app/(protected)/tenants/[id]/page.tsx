import { notFound } from "next/navigation";
import { getTenantDetail, listFeatureFlags, ALL_MODULES } from "@/lib/admin-service";
import { Card, CardHeader, CardTitle, CardContent, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge } from "@elio/ui";
import { TenantActions } from "./tenant-actions";

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getTenantDetail(id);
  if (!detail) notFound();
  const { practice, dentistCount } = detail;
  const allFlags = await listFeatureFlags();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 text-[--color-text-primary]">{practice.name}</h1>
        <p className="mt-1 text-body-sm text-[--color-text-secondary]">
          {practice.users.length} users · {dentistCount} dentists · Dentally: {practice.dentallyConnectionStatus}
        </p>
      </div>

      <TenantActions
        practiceId={practice.id}
        currentPlan={practice.plan}
        suspended={!!practice.suspendedAt}
        licences={ALL_MODULES.map((moduleId) => ({
          moduleId,
          active: practice.licences.find((l) => l.moduleId === moduleId)?.active ?? false,
        }))}
        featureFlags={allFlags.map((f) => ({
          id: f.id,
          key: f.key,
          name: f.name,
          enabled: practice.featureFlags.find((pf) => pf.featureFlagId === f.id)?.enabled ?? false,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Impersonate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {practice.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.role}</TableCell>
                  <TableCell>
                    <Badge variant={u.active ? "success" : "neutral"}>{u.active ? "Active" : "Deactivated"}</Badge>
                  </TableCell>
                  <TableCell>
                    {u.role !== "SUPER_ADMIN" && u.active && (
                      <form action={`/api/tenants/${practice.id}/impersonate/${u.id}`} method="POST">
                        <button type="submit" className="text-body-sm text-[--color-primary-600] hover:underline" data-testid={`impersonate-${u.id}`}>
                          Impersonate
                        </button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
