import { can } from "@elio/auth";
import { getFlowSettings } from "@elio/dentally";
import type { Role } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { FlowSettingsClient } from "./settings-client";

export default async function FlowSettingsPage() {
  const session = await requirePermission("flow:view");
  const settings = await getFlowSettings(session.practiceId);
  const canEdit = can({ role: session.role as Role }, "practice:manage");

  return <FlowSettingsClient initialSettings={settings} canEdit={canEdit} />;
}
