import { requirePermission } from "@/lib/session";
import { PageContent, PageHeader } from "@elio/ui";
import { DentallyMappingsClient } from "./dentally-mappings-client";

/** Dentally plan mappings (P2.1). */
export default async function DentallyPage() {
  await requirePermission("plans:edit-settings");
  const canManage = true;

  return (
    <PageContent>
      <PageHeader
        title="Dentally"
        description="Map Dentally payment plan names to ELIO membership plans for automatic patient import."
      />
      <div className="mt-8">
        <DentallyMappingsClient canManage={canManage} />
      </div>
    </PageContent>
  );
}
