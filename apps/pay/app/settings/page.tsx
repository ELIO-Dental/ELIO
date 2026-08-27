import { redirect } from "next/navigation";
import { scopedDb } from "@elio/db";
import { auth, can } from "@elio/auth";
import type { Role } from "@elio/db";
import { PayNav } from "@/components/pay-nav";
import { SettingsClient } from "./settings-client";

// Server-side gate — never rely on hiding the nav link alone
// (MASTER_BUILD_GUIDE.md Step 1.5 / Testing 1.5 checklist item 2).
export default async function PaySettingsPage() {
  const session = await auth();
  if (!session?.practiceId) redirect("/login");
  if (!can({ role: session.role as Role }, "practice:manage")) redirect("/pay");

  const db = scopedDb(session.practiceId);
  const practice = await db.practice.findUniqueOrThrow({
    where: { id: session.practiceId },
    select: { cosmeticConsultationTreatmentCode: true },
  });

  return (
    <div>
      <PayNav isOwner={session.role === "OWNER"} />
      <div className="min-h-screen bg-[--color-bg] px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-h2 text-[--color-text-primary]">Settings</h1>
          <p className="mt-1 text-body text-[--color-text-secondary]">
            Configure ElioPay settings for your practice.
          </p>
          <SettingsClient initialCode={practice.cosmeticConsultationTreatmentCode} />
        </div>
      </div>
    </div>
  );
}
