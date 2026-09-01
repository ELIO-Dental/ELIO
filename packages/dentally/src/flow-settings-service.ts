import { prisma } from "@elio/db";
import {
  flowSettingsToJson,
  mergeFlowSettingsInput,
  parseFlowSettingsJson,
  type FlowSettings,
} from "./flow-settings";

export async function getFlowSettings(practiceId: string): Promise<FlowSettings> {
  const practice = await prisma.practice.findUniqueOrThrow({
    where: { id: practiceId },
    select: { flowSettingsJson: true },
  });
  return parseFlowSettingsJson(practice.flowSettingsJson);
}

/** F3.3 — header branding for Flow shell (legacy appName + logoUrl, practice name fallback). */
export async function getFlowBranding(practiceId: string): Promise<{ brandTitle: string; logoUrl?: string }> {
  const practice = await prisma.practice.findUniqueOrThrow({
    where: { id: practiceId },
    select: { name: true, flowSettingsJson: true },
  });
  const settings = parseFlowSettingsJson(practice.flowSettingsJson);
  const brandTitle = settings.appDisplayName || practice.name.trim() || "ELIO FLOW";
  return {
    brandTitle,
    logoUrl: settings.logoUrl || undefined,
  };
}

export async function saveFlowSettings(
  practiceId: string,
  input: Record<string, unknown>
): Promise<FlowSettings> {
  const current = await getFlowSettings(practiceId);
  const merged = mergeFlowSettingsInput(current, input);
  await prisma.practice.update({
    where: { id: practiceId },
    data: { flowSettingsJson: flowSettingsToJson(merged) },
  });
  return merged;
}

export type { FlowSettings } from "./flow-settings";
export {
  DEFAULT_FLOW_SETTINGS,
  mergeFlowSettingsInput,
  parseFlowSettingsJson,
} from "./flow-settings";
