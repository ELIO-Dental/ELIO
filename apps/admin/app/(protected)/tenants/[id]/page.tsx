import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTenantDetail, listFeatureFlags, ALL_MODULES } from "@/lib/admin-service";
import {
  countDentallyRecordErrors,
  formatDentallySyncCounts,
  formatWhen,
} from "@/lib/dentally-sync-runs";
import { auth } from "@/lib/auth";
import { requireMfaComplete } from "@/lib/require-mfa-complete";
import { Card, CardHeader, CardTitle, CardContent, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge, PageHeader } from "@elio/ui";
import { TenantActions } from "./tenant-actions";

const SYNC_STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  SUCCESS: "success",
  PARTIAL: "warning",
  FAILED: "danger",
  RUNNING: "info",
};

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) redirect("/login");
  await requireMfaComplete(userId);

  const { id } = await params;
  const detail = await getTenantDetail(id);
  if (!detail) notFound();
  const { practice, dentistCount, dentallySyncRuns } = detail;
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

      <Card className="shadow-(--shadow-sm)" id="dentally-sync-logs" data-testid="dentally-sync-logs">
        <CardHeader>
          <CardTitle>Dentally sync logs</CardTitle>
        </CardHeader>
        <CardContent>
          {dentallySyncRuns.length === 0 ? (
            <p className="text-body-sm text-(--color-text-secondary)">No Dentally sync runs recorded for this practice yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dentallySyncRuns.map((run) => {
                  const recordErrorCount = countDentallyRecordErrors(run.recordErrors);
                  return (
                    <TableRow key={run.id} data-testid={`dentally-sync-run-${run.id}`}>
                      <TableCell>{formatWhen(run.startedAt)}</TableCell>
                      <TableCell>{formatWhen(run.finishedAt)}</TableCell>
                      <TableCell>{run.trigger}</TableCell>
                      <TableCell>
                        <Badge variant={SYNC_STATUS_VARIANT[run.status] ?? "neutral"}>{run.status}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs text-body-sm">{formatDentallySyncCounts(run.counts)}</TableCell>
                      <TableCell>
                        {run.errorMessage ? (
                          <span className="text-body-sm text-(--color-danger)" title={run.errorMessage}>
                            {run.errorMessage}
                          </span>
                        ) : recordErrorCount > 0 ? (
                          <span className="text-body-sm text-(--color-warning)">{recordErrorCount} record error(s)</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
