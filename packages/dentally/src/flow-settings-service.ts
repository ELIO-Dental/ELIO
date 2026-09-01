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
