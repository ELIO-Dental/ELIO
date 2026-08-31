import Link from "next/link";
import { Building2, ShieldCheck, Users } from "lucide-react";
import { listTenants } from "@/lib/admin-service";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Card,
  StatCard,
  EmptyState,
} from "@elio/ui";

/** Step 2.3, §11.2 — the console's main landing view. Every tenant, at a
 * glance: plan, active licences, user count, Dentally status, trial/
 * onboarding/support status. */
export default async function TenantListPage() {
  const tenants = await listTenants();
  const activeCount = tenants.filter((t) => !t.suspendedAt).length;
  const suspendedCount = tenants.length - activeCount;
  const dentallyConnected = tenants.filter((t) => t.dentallyConnectionStatus === "CONNECTED").length;

  return (
    <div className="space-y-8 pb-8 md:pb-0">
      <header className="relative overflow-hidden rounded-(--radius-xl) border border-(--color-border-subtle) bg-linear-to-br from-(--color-primary-50) via-(--color-surface) to-(--color-bg-subtle) p-6 shadow-(--shadow-sm) md:p-8">
        <div className="relative max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-(--radius-full) border border-(--color-primary-200)/80 bg-(--color-surface)/80 px-3 py-1 text-caption font-semibold text-(--color-primary-fg) shadow-(--shadow-xs)">
            <ShieldCheck className="size-3.5" aria-hidden />
            Platform overview
          </p>
          <h1 className="mt-4 text-h1 text-(--color-text-primary)">Tenants</h1>
          <p className="mt-2 text-body leading-relaxed text-(--color-text-secondary)">
            {tenants.length} practice{tenants.length === 1 ? "" : "s"} on ELIO — manage licences, plans, and access.
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total practices" value={tenants.length} />
        <StatCard label="Active" value={activeCount} />
        <StatCard label="Dentally connected" value={dentallyConnected} />
      </div>

      {suspendedCount > 0 && (
        <p className="text-body-sm text-(--color-text-secondary)">
          {suspendedCount} suspended practice{suspendedCount === 1 ? "" : "s"} — review status in the table below.
        </p>
      )}

      <Card className="overflow-hidden shadow-(--shadow-sm)">
        <div className="border-b border-(--color-border-subtle) px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-(--color-primary-fg)" aria-hidden />
            <div>
              <h2 className="text-h3 text-(--color-text-primary)">All practices</h2>
              <p className="mt-1 text-body-sm text-(--color-text-secondary)">
                Open a tenant to manage licences, flags, and impersonation.
              </p>
            </div>
          </div>
        </div>
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
            {tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12">
                  <EmptyState
                    icon={Building2}
                    title="No practices yet"
                    description="When a dental practice signs up through ELIO Portal, it will appear here for licence and access management."
                  />
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Link
                    href={`/tenants/${t.id}`}
                    className="inline-flex items-center gap-2 font-medium text-(--color-primary-fg) hover:text-(--color-primary-fg-muted) hover:underline"
                    data-testid={`tenant-link-${t.id}`}
                  >
                    <Users className="size-4 shrink-0 text-(--color-text-tertiary)" aria-hidden />
                    {t.name}
                  </Link>
                </TableCell>
                <TableCell>{t.plan ?? "—"}</TableCell>
                <TableCell>
                  {t.licences.filter((l) => l.active).length > 0
                    ? t.licences
                        .filter((l) => l.active)
                        .map((l) => l.moduleId)
                        .join(", ")
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
                    <Badge variant="danger" data-testid={`tenant-status-${t.id}`}>
                      Suspended
                    </Badge>
                  ) : (
                    <Badge variant="success" data-testid={`tenant-status-${t.id}`}>
                      Active
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
