import { redirect } from "next/navigation";
import { prisma } from "@elio/db";
import { requireOwnerSession } from "@/lib/require-owner";
import { TeamClient } from "./team-client";

// Server-side gate — never rely on hiding the nav link alone
// (MASTER_BUILD_GUIDE.md Step 1.5 / Testing 1.5 checklist item 2).
export default async function TeamSettingsPage() {
  const session = await requireOwnerSession();
  if (!session) redirect("/launcher");

  const practice = await prisma.practice.findUniqueOrThrow({
    where: { id: session.practiceId },
    select: { requireMfaForAllStaff: true },
  });

  return (
    <div className="min-h-screen bg-(--color-bg) px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-h2 text-(--color-text-primary)">Team</h1>
        <p className="mt-1 text-body text-(--color-text-secondary)">
          Manage who has access to your practice and what they can do.
        </p>
        <TeamClient initialRequireMfaForAllStaff={practice.requireMfaForAllStaff} currentUserId={session.userId} />
      </div>
    </div>
  );
}
