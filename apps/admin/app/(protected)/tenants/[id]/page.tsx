import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTenantDetail, listFeatureFlags, ALL_MODULES } from "@/lib/admin-service";
import { auth } from "@/lib/auth";
import { requireMfaComplete } from "@/lib/require-mfa-complete";
import { Card, CardHeader, CardTitle, CardContent, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge, PageHeader } from "@elio/ui";
import { TenantActions } from "./tenant-actions";

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) redirect("/login");
  await requireMfaComplete(userId);

  const { id } = await params;
  const detail = await getTenantDetail(id);
  if (!detail) notFound();
  const { practice, dentistCount } = detail;
  const allFlags = await listFeatureFlags();

  return (
    <div className="space-y-8 pb-8 md:pb-0">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-body-sm font-medium text-(--color-primary-fg) transition-colors hover:text-(--color-primary-fg-muted) hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to tenants
        </Link>
        <PageHeader
          className="mt-4"
          title={practice.name}
          description={`${practice.users.length} users · ${dentistCount} dentists · Dentally ${practice.dentallyConnectionStatus}`}
        />
        {practice.suspendedAt && (
          <Badge variant="danger" className="mt-3">
            Suspended
          </Badge>
        )}
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

      <Card className="shadow-(--shadow-sm)">
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
                        <button
                          type="submit"
                          className="text-body-sm font-medium text-(--color-primary-fg) hover:text-(--color-primary-fg-muted) hover:underline"
                          data-testid={`impersonate-${u.id}`}
                        >
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
