import { requireLicensedSession, can } from "@/lib/session";
import type { Role } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const session = await requireLicensedSession();
  const canManage = can({ role: session.role as Role }, "team:manage");

  return (
    <PageContent>
      <PageHeader
        title="Users"
        description="Everyone with access to your practice. User accounts are shared across every ELIO module — changes here apply everywhere, not just Plans."
      />

      <div className="mt-8">
        <UsersClient currentUserId={session.userId} canManage={canManage} />
      </div>
    </PageContent>
  );
}
