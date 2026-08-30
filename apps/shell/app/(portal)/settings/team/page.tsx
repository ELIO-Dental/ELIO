import { redirect } from "next/navigation";
import { prisma } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { requireTeamViewSession } from "@/lib/require-owner";
import { TeamClient } from "./team-client";

export default async function TeamSettingsPage() {
  const session = await requireTeamViewSession();
  if (!session) redirect("/launcher");

  const practice = await prisma.practice.findUniqueOrThrow({
    where: { id: session.practiceId },
    select: { requireMfaForAllStaff: true },
  });

  return (
    <PageContent width="md">
      <PageHeader
        title="Team"
        description={
          session.canManage
            ? "Manage who has access to your practice and what they can do."
            : "Who has access to your practice and what they can do (view-only)."
        }
      />
      <div className="mt-8">
        <TeamClient
          initialRequireMfaForAllStaff={practice.requireMfaForAllStaff}
          currentUserId={session.userId}
          canManage={session.canManage}
        />
      </div>
    </PageContent>
  );
}
