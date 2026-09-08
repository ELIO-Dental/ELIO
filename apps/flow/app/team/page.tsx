import type { Role } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { can, requireSession, redirectToLogin } from "@/lib/session";
import { TeamClient } from "./team-client";

/** Old ElioFlow Users — roster in Flow; invite/password stay on Portal (shell login). */
export default async function TeamPage() {
  const session = await requireSession();
  if (!session) return redirectToLogin();

  const canManage = can({ role: session.role as Role }, "team:manage");

  return (
    <PageContent>
      <PageHeader
        title="Team"
        description={
          <>
            Practice users for Flow (same roster as classic ElioFlow Users). Sign-in and invites stay in{" "}
            <a href="/settings/team" className="font-medium text-(--color-brand) hover:underline">
              ELIO Portal → Team
            </a>
            .
          </>
        }
      />
      <div className="mt-8">
        <TeamClient currentUserId={session.userId} canManage={canManage} />
      </div>
    </PageContent>
  );
}
