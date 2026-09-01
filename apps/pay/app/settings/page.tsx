import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/session";
import { getPaySettings } from "@/lib/pay-settings-service";
import { paySettingsForExport } from "@/lib/pay-settings";
import { auth, can } from "@elio/auth";
import type { Role } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { SettingsClient } from "./settings-client";

export default async function PaySettingsPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  if (!can({ role: session.role as Role }, "practice:manage")) redirect("/");

  const settings = paySettingsForExport(await getPaySettings(session.practiceId));

  return (
    <PageContent width="md">
      <PageHeader title="Settings" description="Configure ElioPay settings for your practice." />
      <SettingsClient initialSettings={settings} />
    </PageContent>
  );
}
