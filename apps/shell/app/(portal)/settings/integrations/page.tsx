import { redirect } from "next/navigation";
import { can, getSession } from "@elio/auth";
import type { Role } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { IntegrationsClient } from "./integrations-client";

export default async function IntegrationsSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const role = (session as { role?: Role }).role;
  const canManage = Boolean(role && can({ role }, "integrations:manage"));

  return (
    <PageContent width="md">
      <PageHeader
        title="Integrations"
        description="Connect ELIO to Dentally and manage data sync for your practice."
      />
      <div className="mt-8">
        <IntegrationsClient canManage={canManage} />
      </div>
    </PageContent>
  );
}
