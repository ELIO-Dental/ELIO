import { scopedDb } from "@elio/db";
import {
  mergePaySettingsInput,
  parsePaySettingsJson,
  paySettingsToJson,
  type PaySettings,
} from "./pay-settings";

export async function getPaySettings(practiceId: string): Promise<PaySettings> {
  const db = scopedDb(practiceId);
  const practice = await db.practice.findUniqueOrThrow({
    where: { id: practiceId },
    select: {
      name: true,
      cosmeticConsultationTreatmentCode: true,
      paySettingsJson: true,
    },
  });

  return parsePaySettingsJson(practice.paySettingsJson, {
    practiceName: practice.name,
    cosmeticConsultationTreatmentCode: practice.cosmeticConsultationTreatmentCode,
  });
}

export async function savePaySettings(
  practiceId: string,
  input: Record<string, unknown>
): Promise<PaySettings> {
  const db = scopedDb(practiceId);
  const current = await getPaySettings(practiceId);
  const patch = { ...input };
  if (patch.smtp_pass === "***" || patch.smtp_pass === "") {
    delete patch.smtp_pass;
  }
  const merged = mergePaySettingsInput(current, patch);

  const cosmeticCode =
    merged.cosmetic_consultation_treatment_code.trim() || null;

  await db.practice.update({
    where: { id: practiceId },
    data: {
      paySettingsJson: paySettingsToJson(merged),
      cosmeticConsultationTreatmentCode: cosmeticCode,
    },
  });

  return merged;
}
