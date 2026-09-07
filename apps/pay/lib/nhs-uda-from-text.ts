/**
 * Port of AuraPay extractUdasFromText — NHS Activity Statement paste/PDF text.
 */

export type NhsTextDentist = {
  id: string;
  name: string;
  nhsPerformerNumber: string | null;
  udaRatePence: number | null;
};

export type NhsTextUdaHit = {
  dentistId: string;
  dentistName: string;
  performerNumber: string | null;
  udas: number;
  udaRatePence: number;
  nhsEarningsPence: number;
  source: "text";
};

/** Extract per-clinician UDAs from pasted/PDF NHS statement text. */
export function extractUdasFromNhsText(text: string, nhsDentists: NhsTextDentist[]): NhsTextUdaHit[] {
  const results: NhsTextUdaHit[] = [];
  const perClinicianMatch = text.match(/Units\s+of\s+Dental\s+Activity\s+per\s+Clinician/i);
  const perClinicianIndex = perClinicianMatch ? text.indexOf(perClinicianMatch[0]) : 0;
  const clinicianSection = text.substring(perClinicianIndex);

  const performerPattern = /(\d{6})\s+([A-Z][A-Z\s]+?)(?=\s*Current\s+Financial\s+Year|\s*\d{6}|$)/gi;
  const clinicianBlocks: { perfNum: string; name: string; startIndex: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = performerPattern.exec(clinicianSection)) !== null) {
    clinicianBlocks.push({
      perfNum: match[1]!,
      name: match[2]!.trim(),
      startIndex: match.index,
    });
  }

  for (let i = 0; i < clinicianBlocks.length; i++) {
    const block = clinicianBlocks[i]!;
    const nextBlockStart =
      i + 1 < clinicianBlocks.length ? clinicianBlocks[i + 1]!.startIndex : clinicianSection.length;
    const blockText = clinicianSection.substring(block.startIndex, nextBlockStart);
    const currentFYMatch = blockText.match(
      /Current\s+Financial\s+Year\s+\d{4}\/\d{2}\s*[\n\r\s]*(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/i
    );
    if (!currentFYMatch) continue;
    const udaValue = parseFloat(currentFYMatch[1]!.replace(/,/g, ""));
    if (!Number.isFinite(udaValue) || udaValue <= 0) continue;
    const dentist = nhsDentists.find((d) => d.nhsPerformerNumber === block.perfNum);
    if (!dentist) continue;
    const udaRatePence = dentist.udaRatePence ?? 0;
    results.push({
      dentistId: dentist.id,
      dentistName: dentist.name,
      performerNumber: dentist.nhsPerformerNumber,
      udas: udaValue,
      udaRatePence,
      nhsEarningsPence: Math.round(udaValue * udaRatePence),
      source: "text",
    });
  }

  return results;
}
