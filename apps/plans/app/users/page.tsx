import { requireLicensedSession, can } from "@/lib/session";
import type { Role } from "@elio/db";
import { PlansNav } from "@/components/plans-nav";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const session = await requireLicensedSession();
  const canManage = can({ role: session.role as Role }, "team:manage");

  return (
    <div>
      <PlansNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-(--color-text-primary)">Users</h1>
        <p className="mt-1 text-body text-(--color-text-secondary)">
          Everyone with access to your practice. User accounts are shared across every ELIO
          module — changes here apply everywhere, not just Plans.
        </p>

        <div className="mt-8">
          <UsersClient currentUserId={session.userId} canManage={canManage} />
        </div>
      </div>
    </div>
  );
}
