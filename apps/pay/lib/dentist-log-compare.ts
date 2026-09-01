import {
  parsePayDiscrepancies,
  type PayDiscrepancy,
} from "./pay-discrepancies";

export interface DentistLogEntry {
  patientName: string;
  date: string;
  amount: number;
  treatment?: string;
  notes?: string;
}

export interface SystemPatientForLogCompare {
  name: string;
  date: string;
  amount: number;
  amountPaid?: number;
  status?: string | null;
}

export function parseDentistLogCsv(csvData: string): DentistLogEntry[] {
  const entries: DentistLogEntry[] = [];
  const lines = csvData.trim().split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line || (i === 0 && line.toLowerCase().includes("patient"))) continue;

    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 3) continue;

    const [patientName, date, amountStr, treatment] = parts;
    const amount = parseFloat((amountStr ?? "").replace("£", "").replace(",", "")) || 0;
    if (!patientName || amount <= 0) continue;

    entries.push({
      patientName,
      date: formatLogDate(date ?? ""),
      amount,
      treatment: treatment || undefined,
    });
  }

  return entries;
}

export function parseDentistLogJson(value: unknown): DentistLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is DentistLogEntry =>
      Boolean(item && typeof item === "object" && "patientName" in item && "amount" in item)
  ) as DentistLogEntry[];
}

/** Legacy AuraPay log date normalisation (Y2.7). */
export function formatLogDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().split("T")[0] ?? dateStr;
  }

  const parts = dateStr.split(/[/\-.]/);
  if (parts.length === 3) {
    const a = parts[0] ?? "";
    const b = parts[1] ?? "";
    const c = parts[2] ?? "";
    if (parseInt(a, 10) > 12) {
      return `${c.length === 2 ? `20${c}` : c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
    if (a.length === 4) {
      return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
    }
    return `${c.length === 2 ? `20${c}` : c}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
  }

  return dateStr;
}

export function calculateLogMatchScore(log: DentistLogEntry, sys: SystemPatientForLogCompare): number {
  let score = 0;
  const logName = log.patientName.toLowerCase().trim();
  const sysName = sys.name.toLowerCase().trim();

  if (logName === sysName) {
    score += 50;
  } else {
    const logParts = logName.split(/\s+/);
    const sysParts = sysName.split(/\s+/);
    let matchedParts = 0;
    for (const lp of logParts) {
      if (sysParts.some((sp) => sp.includes(lp) || lp.includes(sp))) matchedParts++;
    }
    if (matchedParts > 0) score += Math.min(40, matchedParts * 20);
  }

  if (log.date === sys.date) {
    score += 30;
  } else {
    const logDate = new Date(log.date);
    const sysDate = new Date(sys.date);
    const diffDays = Math.abs((logDate.getTime() - sysDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) score += 15;
  }

  const amountDiff = Math.abs(log.amount - sys.amount);
  if (amountDiff < 0.01) {
    score += 20;
  } else if (sys.amount > 0 && amountDiff / sys.amount < 0.1) {
    score += 10;
  }

  return score;
}

export function compareDentistLogWithSystem(
  logEntries: DentistLogEntry[],
  systemPatients: SystemPatientForLogCompare[],
  existingDiscrepancies: PayDiscrepancy[] = []
): { logDiscrepancies: PayDiscrepancy[]; allDiscrepancies: PayDiscrepancy[] } {
  const newDiscrepancies: PayDiscrepancy[] = [];
  const matchedSystemIndices = new Set<number>();
  const matchedLogIndices = new Set<number>();

  for (let logIdx = 0; logIdx < logEntries.length; logIdx++) {
    const logEntry = logEntries[logIdx]!;
    let bestMatch: { idx: number; score: number } | null = null;

    for (let sysIdx = 0; sysIdx < systemPatients.length; sysIdx++) {
      if (matchedSystemIndices.has(sysIdx)) continue;
      const score = calculateLogMatchScore(logEntry, systemPatients[sysIdx]!);
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { idx: sysIdx, score };
      }
    }

    if (bestMatch && bestMatch.score >= 50) {
      const sysPatient = systemPatients[bestMatch.idx]!;
      matchedSystemIndices.add(bestMatch.idx);
      matchedLogIndices.add(logIdx);

      const amountDiff = Math.abs(logEntry.amount - sysPatient.amount);
      if (amountDiff > 0.01) {
        newDiscrepancies.push({
          type: "log_mismatch",
          patientName: logEntry.patientName,
          invoicedAmount: sysPatient.amount,
          paidAmount: sysPatient.amountPaid ?? sysPatient.amount,
          logAmount: logEntry.amount,
          date: logEntry.date,
          notes: `Log amount (£${logEntry.amount.toFixed(2)}) differs from system (£${sysPatient.amount.toFixed(2)}) by £${amountDiff.toFixed(2)}`,
        });
      }
    } else {
      newDiscrepancies.push({
        type: "in_log_not_system",
        patientName: logEntry.patientName,
        invoicedAmount: 0,
        paidAmount: 0,
        logAmount: logEntry.amount,
        date: logEntry.date,
        notes: `In dentist log (£${logEntry.amount.toFixed(2)}) but not found in Dentally data`,
      });
    }
  }

  for (let sysIdx = 0; sysIdx < systemPatients.length; sysIdx++) {
    if (matchedSystemIndices.has(sysIdx)) continue;
    const sysPatient = systemPatients[sysIdx]!;
    newDiscrepancies.push({
      type: "in_system_not_log",
      patientName: sysPatient.name,
      invoicedAmount: sysPatient.amount,
      paidAmount: sysPatient.amountPaid ?? sysPatient.amount,
      date: sysPatient.date,
      notes: `In Dentally (£${sysPatient.amount.toFixed(2)}) but not in dentist's log - verify treatment was done`,
    });
  }

  const paymentDiscrepancies = parsePayDiscrepancies(existingDiscrepancies).filter(
    (d) => d.type === "invoiced_not_paid" || d.type === "partial_payment"
  );

  return {
    logDiscrepancies: newDiscrepancies,
    allDiscrepancies: [...paymentDiscrepancies, ...newDiscrepancies],
  };
}

export function dentistLogCompareSummary(
  logEntries: DentistLogEntry[],
  systemPatients: SystemPatientForLogCompare[],
  logDiscrepancies: PayDiscrepancy[]
) {
  const matched = logEntries.length - logDiscrepancies.filter((d) => d.type === "in_log_not_system").length;
  return {
    logEntries: logEntries.length,
    systemPatients: systemPatients.length,
    matched: Math.max(0, matched),
    inLogNotSystem: logDiscrepancies.filter((d) => d.type === "in_log_not_system").length,
    inSystemNotLog: logDiscrepancies.filter((d) => d.type === "in_system_not_log").length,
    amountMismatches: logDiscrepancies.filter((d) => d.type === "log_mismatch").length,
  };
}
