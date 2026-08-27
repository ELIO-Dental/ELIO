/**
 * Compass NHS statement parser — APPLICATION_FLOW.md §6.2.
 *
 * Deterministic text-extraction + pattern-matching against the NHSBSA "Contract Monthly
 * Pay Statement" PDF (real sample: project-docs/../Refrence/JuneJuly Compass Statement.pdf,
 * copied into packages/pay-engine/test-fixtures/ per Step 1.6's instructions). No OCR/LLM.
 *
 * Two sections matter:
 *  - Page 2 "Performers' Superannuation Contribution": `<performer#> <SURNAME> @ <rate>% <£amt>`
 *  - Page 3 "Units of Dental Activity per Clinician": per-clinician block listing UDAs for
 *    "Current Financial Year" (the ONLY figure to use) vs. "Last Financial Year" /
 *    "Other Financial Years", plus a separate practice-wide "Cumulative Units" total that
 *    must NEVER be read as a per-clinician figure.
 */

// pdf-parse has no ESM types bundled cleanly for this TS config — narrow require-style import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;

export interface CompassLineExtraction {
  performerNumber: string;
  rawName: string;
  udas: number | null;
  superannuationPence: number | null;
  /** true only when BOTH figures were found unambiguously for this performer number. */
  confident: boolean;
}

export interface CompassParseResult {
  contractNumber: string | null;
  activityPeriodStart: string | null; // display/audit only, never gates private-earnings calc
  activityPeriodEnd: string | null;
  lines: CompassLineExtraction[];
  rawTextLength: number;
}

function poundsToPence(str: string): number {
  const clean = str.replace(/[£,]/g, "");
  return Math.round(parseFloat(clean) * 100);
}

function ddmmyyyyToIso(str: string): string | null {
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m as unknown as [string, string, string, string];
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Extracts contract number from the cover page, e.g. "QHM 1012290000". */
function extractContractNumber(text: string): string | null {
  const m = text.match(/\b([A-Z]{2,4})\s{1,4}(\d{6,10})\b/);
  return m ? `${m[1]!} ${m[2]!}` : null;
}

/** e.g. "Activity for June (20/05/2026 - 16/06/2026)" — stored purely for display/audit. */
function extractActivityPeriod(text: string): { start: string | null; end: string | null } {
  const m = text.match(/Activity for \w+\s*\((\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})\)/i);
  if (!m) return { start: null, end: null };
  return { start: ddmmyyyyToIso(m[1]!), end: ddmmyyyyToIso(m[2]!) };
}

/**
 * Page 2 — "Performers' Superannuation Contribution": one line per clinician,
 * `<performer#> <SURNAME> @ <rate>% <£amount>`.
 */
function extractSuperannuation(text: string): Map<string, { name: string; pence: number }> {
  const out = new Map<string, { name: string; pence: number }>();
  const sectionMatch = text.match(/Performers'?\s+Superannuation\s+Contribution/i);
  if (!sectionMatch) return out;
  const sectionStart = sectionMatch.index! + sectionMatch[0].length;
  // Bound to the NEXT section heading — critically, "Employer's Contribution (for
  // information)" further down the same statement uses the identical
  // "<perf#> <NAME> @ <rate>% <£amt>" shape and must NOT be picked up here (a real bug
  // caught during verification against the real fixture: it silently overwrote the
  // correct Performers' Superannuation figure with the Employer's Contribution one).
  const nextHeadingMatch = text.substring(sectionStart).match(/Patients'?\s+Charges|Employer'?s\s+Contribution/i);
  const sectionEnd = nextHeadingMatch ? sectionStart + nextHeadingMatch.index! : sectionStart + 2000;
  const section = text.substring(sectionStart, sectionEnd);

  const lineRe = /(\d{5,7})\s+([A-Za-z][A-Za-z\s]+?)\s*@\s*[\d.]+%\s*£?\s*([\d,]+\.\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(section)) !== null) {
    out.set(m[1]!, { name: m[2]!.trim(), pence: poundsToPence(m[3]!) });
  }
  return out;
}

/**
 * Page 3 — "Units of Dental Activity per Clinician": per-clinician block, extract ONLY the
 * "Current Financial Year" figure (never "Last Financial Year"/"Other Financial Years", and
 * never the separate practice-wide "Cumulative Units" total on the same page).
 */
function extractUdasPerClinician(text: string): Map<string, { name: string; udas: number }> {
  const out = new Map<string, { name: string; udas: number }>();
  const sectionMatch = text.match(/Units\s+of\s+Dental\s+Activity\s+per\s+Clinician/i);
  if (!sectionMatch) return out;
  const section = text.substring(sectionMatch.index!);

  // Cut off before any practice-wide "Cumulative Units" summary so it can never be picked
  // up as a per-clinician block by accident.
  const cumulativeIdx = section.search(/Cumulative\s+Units(?!\s+per\s+Clinician)/i);
  const clinicianSection = section.substring(0, cumulativeIdx === -1 ? section.length : section.length);

  const performerRe = /(\d{5,7})\s+([A-Za-z][A-Za-z\s]+?)(?=\s*Current\s+Financial\s+Year|\s*\d{5,7}\s+[A-Za-z]|$)/g;
  const blocks: { perfNum: string; name: string; start: number }[] = [];
  let bm: RegExpExecArray | null;
  while ((bm = performerRe.exec(clinicianSection)) !== null) {
    blocks.push({ perfNum: bm[1]!, name: bm[2]!.trim(), start: bm.index });
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const end = i + 1 < blocks.length ? blocks[i + 1]!.start : clinicianSection.length;
    const blockText = clinicianSection.substring(b.start, end);

    // ONLY "Current Financial Year <yyyy/yy>" figure — deliberately not matching
    // "Last Financial Year" / "Other Financial Years" / "Cumulative Units".
    const cfyMatch = blockText.match(
      /Current\s+Financial\s+Year\s+\d{4}\/\d{2}\D*?([\d,]+\.\d{2})/i
    );
    if (cfyMatch) {
      out.set(b.perfNum, { name: b.name, udas: parseFloat(cfyMatch[1]!.replace(/,/g, "")) });
    }
  }

  return out;
}

/**
 * Parses raw Compass statement PDF bytes into per-clinician line extractions.
 * `knownPerformerNumbers`/`knownNamesByPerformer` come from `Dentist.nhsPerformerNumber` —
 * used only to flag a NAME MISMATCH (a performer number that now maps to a different name
 * than before is a real signal something is off, per §6.2) — matching itself is by number.
 */
export async function parseCompassStatement(
  pdfBuffer: Buffer,
  knownNamesByPerformer?: Map<string, string>
): Promise<CompassParseResult> {
  const { text } = await pdfParse(pdfBuffer);

  const contractNumber = extractContractNumber(text);
  const { start, end } = extractActivityPeriod(text);
  const superannuation = extractSuperannuation(text);
  const udas = extractUdasPerClinician(text);

  const allPerformerNumbers = new Set<string>([...superannuation.keys(), ...udas.keys()]);
  const lines: CompassLineExtraction[] = [];

  for (const perfNum of allPerformerNumbers) {
    const sup = superannuation.get(perfNum) ?? null;
    const uda = udas.get(perfNum) ?? null;
    const rawName = uda?.name ?? sup?.name ?? "";

    let confident = sup !== null && uda !== null;
    if (confident && knownNamesByPerformer) {
      const known = knownNamesByPerformer.get(perfNum);
      // A performer number matched to a DIFFERENT name than last time is a real signal
      // something's off — flag for manual review instead of silently trusting it.
      if (known && known.toUpperCase().replace(/\s+/g, "") !== rawName.toUpperCase().replace(/\s+/g, "")) {
        confident = false;
      }
    }
    if (knownNamesByPerformer && !knownNamesByPerformer.has(perfNum)) {
      // Unknown performer number entirely — never guessed or defaulted.
      confident = false;
    }

    lines.push({
      performerNumber: perfNum,
      rawName,
      udas: uda?.udas ?? null,
      superannuationPence: sup?.pence ?? null,
      confident,
    });
  }

  return { contractNumber, activityPeriodStart: start, activityPeriodEnd: end, lines, rawTextLength: text.length };
}
