import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/session";
import { scopedDb } from "@elio/db";
import { auth, can } from "@elio/auth";
import type { Role } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { SetupClient } from "./setup-client";

export default async function PracticeSetupPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  if (!can({ role: session.role as Role }, "practice:manage")) redirect("/");

  const db = scopedDb(session.practiceId);
  const [labs, suppliers, dentists] = await Promise.all([
    db.savedLab.count(),
    db.savedSupplier.count(),
    db.dentist.count(),
  ]);

  return (
    <PageContent width="md">
      <PageHeader
        title="Practice Setup"
        description="Bulk import or export labs, suppliers, dentists, and settings in one go."
      />
      <SetupClient counts={{ labs, suppliers, dentists }} />
    </PageContent>
  );
}
