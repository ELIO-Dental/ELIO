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
        description={
          <>
            Practice roster for Plans. Invite or create users in{" "}
            <a href="/settings/team" className="font-medium text-(--color-primary-fg) hover:underline">
              ELIO Portal → Team
            </a>
            ; here you can view roles and active status.
          </>
        }
      />

      <div className="mt-8">
        <UsersClient currentUserId={session.userId} canManage={canManage} />
      </div>
    </PageContent>
  );
}
