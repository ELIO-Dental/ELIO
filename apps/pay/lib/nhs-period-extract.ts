/** NHS statement period date extraction (legacy AuraPay nhs-statement/route.ts, Y2.8). */

export interface NhsPeriodExtraction {
  periodStart?: string;
  periodEnd?: string;
}

const MONTH_NUMBERS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

/** Return YYYY-MM-DD when valid, otherwise null. */
export function toValidISODate(dateStr: string | null | undefined): string | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const parts = dateStr.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return dateStr;
}

/** Convert DD/MM/YYYY or DD/MM/YY to YYYY-MM-DD. */
export function convertToISODate(dateStr: string): string {
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const day = parts[0] ?? "";
    const month = parts[1] ?? "";
    const yearStr = parts[2] ?? "";
    let year = yearStr;
    if (yearStr.length === 2) {
      const yearNum = parseInt(yearStr, 10);
      year = yearNum >= 50 ? `19${yearStr}` : `20${yearStr}`;
    }
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return dateStr;
}

/** Extract NHS period dates from statement PDF/text. */
export function extractNhsPeriodDates(text: string): NhsPeriodExtraction {
  const result: NhsPeriodExtraction = {};

  const dateRangePattern1 = /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i;
  const match1 = text.match(dateRangePattern1);
  if (match1?.[1] && match1[2]) {
    const isoStart = toValidISODate(convertToISODate(match1[1]));
    const isoEnd = toValidISODate(convertToISODate(match1[2]));
    if (isoStart && isoEnd) {
      result.periodStart = isoStart;
      result.periodEnd = isoEnd;
      return result;
    }
  }

  const monthNames = "January|February|March|April|May|June|July|August|September|October|November|December";
  const dateRangePattern2 = new RegExp(
    `(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\s+(\\d{4})\\s*(?:[-–]|to)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\s+(\\d{4})`,
    "i"
  );
  const match2 = text.match(dateRangePattern2);
  if (match2?.[1] && match2[2] && match2[3] && match2[4] && match2[5] && match2[6]) {
    const month1 = match2[2].toLowerCase();
    const month2 = match2[5].toLowerCase();
    const isoStart = toValidISODate(
      `${match2[3]}-${MONTH_NUMBERS[month1] ?? "01"}-${match2[1].padStart(2, "0")}`
    );
    const isoEnd = toValidISODate(
      `${match2[6]}-${MONTH_NUMBERS[month2] ?? "01"}-${match2[4].padStart(2, "0")}`
    );
    if (isoStart && isoEnd) {
      result.periodStart = isoStart;
      result.periodEnd = isoEnd;
      return result;
    }
  }

  const periodPattern = /period[:\s]+(.+?)(?:\n|$)/i;
  const periodMatch = text.match(periodPattern);
  if (periodMatch?.[1]) {
    const periodText = periodMatch[1];
    const dates = periodText.match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
    if (dates && dates.length >= 2 && dates[0] && dates[1]) {
      const isoStart = toValidISODate(convertToISODate(dates[0]));
      const isoEnd = toValidISODate(convertToISODate(dates[1]));
      if (isoStart && isoEnd) {
        result.periodStart = isoStart;
        result.periodEnd = isoEnd;
      }
    }
  }

  return result;
}
