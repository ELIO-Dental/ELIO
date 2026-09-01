// ElioFlow business logic — Step 1.8 (MASTER_BUILD_GUIDE.md §1.8).
// Mirrors apps/plans/lib/plans-service.ts's convention: scopedDb() for every
// tenant-owned read/write, writeAuditLog() for anything that changes state a
// user might need to trace, plain Error throws for the route layer to map.
import { scopedDb } from "@elio/db";
import { writeAuditLog } from "@elio/auth";
import {
  getAppointments,
  importCosmeticConsultsFromDentally,
  syncConsultFinancialsFromSyncedCore,
} from "@elio/dentally";

export { importCosmeticConsultsFromDentally };
export type { CosmeticConsultImportResult } from "@elio/dentally";

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/** Capture a new enquiry — the first, "Capture" column of the pipeline. */
export async function captureEnquiry(
  practiceId: string,
  input: { patientId?: string; source?: string; capturedByUserId: string },
) {
  const db = scopedDb(practiceId);
  return db.enquiry.create({
    data: {
      practiceId,
      patientId: input.patientId ?? null,
      source: input.source ?? null,
      capturedByUserId: input.capturedByUserId,
    },
  });
}

// ---------------------------------------------------------------------------
// Pipeline (kanban board)
// ---------------------------------------------------------------------------

const CONSULT_INCLUDE = {
  enquiry: { include: { patient: true } },
  practitionerDentist: true,
  reminders: { orderBy: { dueAt: "asc" as const } },
} satisfies Record<string, unknown>;

export type PipelineColumn = "capture" | "consult_quote" | "thinking" | "reminders" | "closed";

/**
 * Groups every open Enquiry/Consult into the 5 kanban columns.
 *
 * Column boundary reasoning (APPLICATION_FLOW.md §8's funnel: enquiry ->
 * consult+quote -> outcome (accepted/thinking/declined), thinking gets a
 * reminder sequence until closed):
 *  - Capture: an Enquiry with no Consult row yet at all — nothing has been
 *    booked/recorded for it.
 *  - Consult+Quote: a Consult exists but has no outcome yet (outcome is
 *    null) — consult booked/completed, quote may or may not be in yet.
 *  - Outcome: Thinking: outcome === THINKING. Per §8's diagram this is the
 *    branch that gets the reminder sequence, so it's kept as its own column
 *    distinct from "Reminders" below (a THINKING consult always starts here,
 *    then can move into Reminders once a reminder is actually scheduled).
 *  - Reminders: a Consult (in any non-closed outcome state, in practice
 *    THINKING) that has at least one Reminder row with sentAt === null
 *    (i.e. a follow-up is scheduled and still outstanding). This is a
 *    materially different board position from plain "Thinking" because
 *    staff can see follow-up is already in motion vs. still needing one
 *    scheduled — the boundary is "has an active (unsent) reminder", not
 *    "outcome is THINKING", since a THINKING consult with zero reminders
 *    scheduled still needs staff attention in the Thinking column.
 *  - Closed: outcome is ACCEPTED or DECLINED — funnel exit, per §8.
 */
export async function listPipeline(practiceId: string) {
  const db = scopedDb(practiceId);

  const [enquiries, consults] = await Promise.all([
    db.enquiry.findMany({
      where: { consults: { none: {} } },
      include: { patient: true },
      orderBy: { capturedAt: "desc" },
    }),
    db.consult.findMany({
      include: CONSULT_INCLUDE,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const columns: {
    capture: typeof enquiries;
    consult_quote: typeof consults;
    thinking: typeof consults;
    reminders: typeof consults;
    closed: typeof consults;
  } = { capture: enquiries, consult_quote: [], thinking: [], reminders: [], closed: [] };

  for (const c of consults) {
    if (c.outcome === "ACCEPTED" || c.outcome === "DECLINED") {
      columns.closed.push(c);
    } else if (c.outcome === "THINKING") {
      const hasActiveReminder = c.reminders.some((r) => r.sentAt === null);
      if (hasActiveReminder) columns.reminders.push(c);
      else columns.thinking.push(c);
    } else {
      columns.consult_quote.push(c);
    }
  }

  return columns;
}

// ---------------------------------------------------------------------------
// Consults
// ---------------------------------------------------------------------------

export async function recordConsult(
  practiceId: string,
  input: {
    enquiryId: string;
    appointmentId?: string;
    attended?: boolean;
    practitionerDentistId?: string;
    quotePence?: number;
    hasDeposit?: boolean;
    treatmentBooked?: boolean;
  },
) {
  const db = scopedDb(practiceId);
  const enquiry = await db.enquiry.findUnique({ where: { id: input.enquiryId } });
  if (!enquiry) throw new Error("Enquiry not found");

  return db.consult.create({
    data: {
      practiceId,
      enquiryId: input.enquiryId,
      appointmentId: input.appointmentId ?? null,
      attended: input.attended ?? null,
      practitionerDentistId: input.practitionerDentistId ?? null,
      quotePence: input.quotePence ?? null,
      hasDeposit: input.hasDeposit ?? null,
      treatmentBooked: input.treatmentBooked ?? null,
    },
  });
}

/**
 * Update an EXISTING Consult's own fields (quote, deposit, treatment booked,
 * practitioner, notes) — distinct from recordConsult() above, which only
 * ever creates a new row. A Consult can already exist with no details filled
 * in (moveStage() creates a bare one when a card is dragged out of Capture),
 * so the detail screen needs an update path, not another create.
 */
export async function updateConsultDetails(
  practiceId: string,
  consultId: string,
  input: {
    quotePence?: number | null;
    quotePenceOverride?: number | null;
    hasDeposit?: boolean | null;
    treatmentBooked?: boolean | null;
    practitionerDentistId?: string | null;
    notes?: string | null;
    planSignedUp?: boolean;
    legacyStatus?: string;
  },
) {
  const db = scopedDb(practiceId);
  const consult = await db.consult.findUnique({ where: { id: consultId } });
  if (!consult) throw new Error("Consult not found");

  const data: Parameters<typeof db.consult.update>[0]["data"] = {};
  if ("quotePence" in input) data.quotePence = input.quotePence;
  if ("quotePenceOverride" in input) data.quotePenceOverride = input.quotePenceOverride;
  if ("hasDeposit" in input) data.hasDeposit = input.hasDeposit;
  if ("treatmentBooked" in input) data.treatmentBooked = input.treatmentBooked;
  if ("practitionerDentistId" in input) {
    data.practitionerDentistId = input.practitionerDentistId;
    data.practitionerEdited = true;
  }
  if ("notes" in input) data.notes = input.notes;
  if ("planSignedUp" in input) data.planSignedUp = input.planSignedUp;

  if (input.legacyStatus !== undefined) {
    const mapped = legacyStatusToOutcome(input.legacyStatus);
    data.outcome = mapped.outcome;
    data.stuckReason = mapped.stuckReason;
    data.outcomeAt = mapped.outcome ? new Date() : null;
    if (mapped.planSignedUp !== undefined) data.planSignedUp = mapped.planSignedUp;
  }

  return db.consult.update({ where: { id: consultId }, data });
}

/** Map legacy dashboard status keys to Consult outcome fields (§1.3). */
export function legacyStatusToOutcome(statusKey: string): {
  outcome: "ACCEPTED" | "THINKING" | "DECLINED" | null;
  stuckReason: "FAILED_FINANCE" | "PRICE_SHOPPING" | "BAD_EXPERIENCE" | "OUT_OF_BUDGET" | null;
  planSignedUp?: boolean;
} {
  switch (statusKey) {
    case "new":
      return { outcome: null, stuckReason: null, planSignedUp: false };
    case "thinking":
      return { outcome: "THINKING", stuckReason: null };
    case "failed-finance":
      return { outcome: "THINKING", stuckReason: "FAILED_FINANCE" };
    case "price-shopping":
      return { outcome: "THINKING", stuckReason: "PRICE_SHOPPING" };
    case "bad-experience":
      return { outcome: "THINKING", stuckReason: "BAD_EXPERIENCE" };
    case "out-of-budget":
      return { outcome: "THINKING", stuckReason: "OUT_OF_BUDGET" };
    case "converted":
      return { outcome: "ACCEPTED", stuckReason: null, planSignedUp: false };
    case "completed":
      return { outcome: "ACCEPTED", stuckReason: null, planSignedUp: true };
    case "declined":
      return { outcome: "DECLINED", stuckReason: null };
    default:
      throw new Error(`Invalid legacy status: ${statusKey}`);
  }
}

export async function updateConsultFromDashboard(
  practiceId: string,
  actor: { actorUserId: string; impersonatedUserId?: string },
  consultId: string,
  input: Parameters<typeof updateConsultDetails>[2],
) {
  const updated = await updateConsultDetails(practiceId, consultId, input);
  await writeAuditLog({
    ...actor,
    practiceId,
    action: "flow.consult.dashboard_edit",
    targetType: "Consult",
    targetId: consultId,
    metadata: input,
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

export async function recordOutcome(
  practiceId: string,
  actor: { actorUserId: string; impersonatedUserId?: string },
  input: {
    consultId: string;
    outcome: "ACCEPTED" | "THINKING" | "DECLINED";
    stuckReason?: "FAILED_FINANCE" | "PRICE_SHOPPING" | "BAD_EXPERIENCE" | "OUT_OF_BUDGET";
  },
) {
  const db = scopedDb(practiceId);
  const consult = await db.consult.findUnique({ where: { id: input.consultId } });
  if (!consult) throw new Error("Consult not found");

  const updated = await db.consult.update({
    where: { id: input.consultId },
    data: {
      outcome: input.outcome,
      outcomeAt: new Date(),
      stuckReason: input.outcome === "THINKING" || input.outcome === "DECLINED" ? (input.stuckReason ?? null) : null,
    },
  });

  await writeAuditLog({
    ...actor,
    practiceId,
    action: "flow.consult.outcome",
    targetType: "Consult",
    targetId: input.consultId,
    metadata: { outcome: input.outcome, stuckReason: input.stuckReason },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Stage move (kanban drag)
// ---------------------------------------------------------------------------

/**
 * Generic "drag card to new column" handler for the kanban UI.
 *
 * `cardId` is the Enquiry id when dragging out of Capture (no Consult row
 * exists yet), otherwise the Consult id. `toColumn` is one of the 5 board
 * columns from listPipeline() above.
 *
 * - capture -> consult_quote: creates the initial Consult row for the
 *   Enquiry if one doesn't already exist (cardId is the Enquiry id here).
 * - -> thinking: sets outcome=THINKING, outcomeAt=now (same effect as
 *   recordOutcome, exposed here so a plain drag doesn't require a
 *   stuckReason prompt — staff can add one later from the card).
 * - -> reminders: dragging here on its own doesn't create a Reminder (that
 *   needs a dueAt/channel from the reminder form) — it sets outcome=THINKING
 *   so the card is at least in the right funnel stage; real "Reminders"
 *   column placement then follows from scheduleReminder() being called.
 * - -> closed: sets outcome=ACCEPTED (closing a card without an explicit
 *   accept/decline choice defaults to the "positive" close from a drag —
 *   callers that need DECLINED specifically should use recordOutcome()).
 *
 * Every move writes an AuditLog row (`flow.consult.stage-move`).
 */
export async function moveStage(
  practiceId: string,
  actor: { actorUserId: string; impersonatedUserId?: string },
  cardId: string,
  toColumn: PipelineColumn,
) {
  const db = scopedDb(practiceId);

  let consult = await db.consult.findUnique({ where: { id: cardId } });

  if (!consult) {
    // cardId must be an Enquiry id (card was in the Capture column).
    const enquiry = await db.enquiry.findUnique({ where: { id: cardId } });
    if (!enquiry) throw new Error("Card not found");
    if (toColumn === "capture") {
      // Nothing to do — already in Capture.
      await writeAuditLog({
        ...actor,
        practiceId,
        action: "flow.consult.stage-move",
        targetType: "Enquiry",
        targetId: cardId,
        metadata: { toColumn },
      });
      return { enquiry };
    }
    consult = await db.consult.create({ data: { practiceId, enquiryId: enquiry.id } });
  }

  const data: { outcome?: "ACCEPTED" | "THINKING" | "DECLINED" | null; outcomeAt?: Date | null } = {};
  if (toColumn === "consult_quote") {
    data.outcome = null;
    data.outcomeAt = null;
  } else if (toColumn === "thinking" || toColumn === "reminders") {
    data.outcome = "THINKING";
    data.outcomeAt = new Date();
  } else if (toColumn === "closed") {
    data.outcome = "ACCEPTED";
    data.outcomeAt = new Date();
  }

  const updated = await db.consult.update({ where: { id: consult.id }, data });

  await writeAuditLog({
    ...actor,
    practiceId,
    action: "flow.consult.stage-move",
    targetType: "Consult",
    targetId: consult.id,
    metadata: { toColumn },
  });

  return { consult: updated };
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export async function scheduleReminder(
  practiceId: string,
  consultId: string,
  dueAt: Date,
  channel?: string,
) {
  const db = scopedDb(practiceId);
  const consult = await db.consult.findUnique({ where: { id: consultId } });
  if (!consult) throw new Error("Consult not found");
  return db.reminder.create({
    data: { practiceId, consultId, dueAt, channel: channel ?? null },
  });
}

export async function markReminderSent(practiceId: string, reminderId: string) {
  const db = scopedDb(practiceId);
  const reminder = await db.reminder.findUnique({ where: { id: reminderId } });
  if (!reminder) throw new Error("Reminder not found");
  return db.reminder.update({ where: { id: reminderId }, data: { sentAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Cross-module handoff (ACCEPTED -> ElioPlans signup)
// ---------------------------------------------------------------------------

/**
 * UI-shortcut handoff only (APPLICATION_FLOW.md §8/§12, MASTER_BUILD_GUIDE.md
 * line 891-894): flips Consult.planSignedUp so ElioFlow's own funnel/
 * conversion reporting knows this ACCEPTED consult already moved into
 * ElioPlans, without ElioFlow ever reading or writing ElioPlans' own tables
 * (PlanPatient/PatientPlanEnrolment stay owned exclusively by apps/plans).
 * The actual signup happens client-side by navigating to a pre-filled
 * ElioPlans form — this just records that the handoff was triggered.
 */
export async function triggerPlansHandoff(practiceId: string, actor: { actorUserId: string; impersonatedUserId?: string }, consultId: string) {
  const db = scopedDb(practiceId);
  const consult = await db.consult.findUnique({ where: { id: consultId } });
  if (!consult) throw new Error("Consult not found");
  if (consult.outcome !== "ACCEPTED") throw new Error("Consult is not ACCEPTED");

  const updated = await db.consult.update({
    where: { id: consultId },
    data: { planSignedUp: true },
  });

  await writeAuditLog({
    ...actor,
    practiceId,
    action: "flow.consult.plans-handoff",
    targetType: "Consult",
    targetId: consultId,
    metadata: {},
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Dentally linking (MASTER_BUILD_GUIDE.md §1.8: "link every enquiry/consult
// to a real Dentally patient record"). Reads through packages/dentally's
// queries only — this is ELIO's own already-synced core data (Step 1.4's
// sync job), never a live Dentally API call from apps/flow directly (FR-9).
// ---------------------------------------------------------------------------

/**
 * Candidate Dentally-synced appointments for linking to a Consult, for a
 * given patient. The old standalone ElioFlow app filtered its entire
 * dataset to appointments whose `reason` contained "Cosmetic Consultation"
 * (hardcoded) — this does the same *soft* filter (case-insensitive
 * substring match on the now-synced `Appointment.reason` field, see
 * packages/db/prisma/schema.prisma's 2026-08-19 addition) but falls back to
 * returning ALL of the patient's appointments if none match, since a
 * practice's real `reason` values are configurable text and a hard filter
 * that silently returns nothing would strand staff with no way to link a
 * real appointment just because the wording didn't match "consultation".
 */
export async function findLinkableAppointments(practiceId: string, patientId: string) {
  const appointments = await getAppointments(practiceId, { patientId, take: 50 });
  const consultationLike = appointments.filter((a) => a.reason?.toLowerCase().includes("consult"));
  return consultationLike.length > 0 ? consultationLike : appointments;
}

/**
 * Link a Consult to a real Dentally-synced Appointment. Also derives
 * `attended` from the appointment's synced state — old ElioFlow's exact
 * rule (pages/api/pipeline.ts): attended = state is 'Completed' or 'In
 * surgery'. Does NOT overwrite `attended`/`practitionerDentistId` if the
 * consult already has them manually set (never silently clobber a human
 * correction — same discipline as `quotePenceOverride`).
 */
export async function linkConsultToAppointment(practiceId: string, consultId: string, appointmentId: string) {
  const db = scopedDb(practiceId);
  const [consult, appointment] = await Promise.all([
    db.consult.findUnique({ where: { id: consultId } }),
    db.appointment.findUnique({ where: { id: appointmentId } }),
  ]);
  if (!consult) throw new Error("Consult not found");
  if (!appointment) throw new Error("Appointment not found");

  const derivedAttended =
    appointment.dentallyState === "Completed" || appointment.dentallyState === "In surgery" ? true : null;

  let practitionerDentistId = consult.practitionerDentistId;
  if (!consult.practitionerEdited && !practitionerDentistId && appointment.practitionerId) {
    const dentist = await db.dentist.findFirst({
      where: { dentallyPractitionerId: appointment.practitionerId },
    });
    practitionerDentistId = dentist?.id ?? null;
  }

  return db.consult.update({
    where: { id: consultId },
    data: {
      appointmentId,
      attended: consult.attended ?? derivedAttended,
      practitionerDentistId,
    },
  });
}

/** Sync consult financials from Dentally-synced core (delegates to @elio/dentally). */
export async function syncConsultFinancials(practiceId: string, consultId: string) {
  return syncConsultFinancialsFromSyncedCore(practiceId, consultId);
}

// ---------------------------------------------------------------------------
// Dashboard (F2.1–F2.5 — legacy ElioFlow home parity)
// ---------------------------------------------------------------------------

const PAID_CONVERSION_THRESHOLD_PENCE = 45_000; // £450 — legacy conversion rule

export interface FlowDashboardStats {
  totalConsultations: number;
  attended: number;
  converted: number;
  stuck: number;
  totalPlannedPence: number;
  totalPaidPence: number;
  planSignUps: number;
  conversionRate: number;
}

export interface FlowDashboardRow {
  id: string;
  patientId: string | null;
  patientName: string;
  patientEmail: string | null;
  patientPhone: string | null;
  dentistId: string | null;
  dentistName: string;
  bookedBy: string | null;
  consultationDate: string | null;
  planValuePence: number;
  quotePence: number | null;
  quotePenceOverride: number | null;
  totalPaidPence: number;
  attended: boolean;
  hasPlan: boolean;
  hasDeposit: boolean;
  treatmentBooked: boolean;
  daysSinceConsult: number;
  statusLabel: string;
  statusKey: string;
  planSignedUp: boolean;
  touchPoints: number;
  notes: string | null;
}

export interface FlowDashboardData {
  stats: FlowDashboardStats;
  rows: FlowDashboardRow[];
  dentists: { id: string; name: string }[];
}

function planValuePence(c: { quotePenceOverride: number | null; quotePence: number | null }) {
  return c.quotePenceOverride ?? c.quotePence ?? 0;
}

function consultDate(c: { appointment: { startsAt: Date | null } | null; createdAt: Date }) {
  return c.appointment?.startsAt ?? c.createdAt;
}

/** Legacy ElioFlow conversion: ACCEPTED/planSignedUp OR (deposit/£450+ paid + treatment booked). */
export function isLegacyConverted(c: {
  outcome: string | null;
  planSignedUp: boolean;
  hasDeposit: boolean | null;
  totalPaidPence: number | null;
  treatmentBooked: boolean | null;
}): boolean {
  if (c.outcome === "ACCEPTED" || c.planSignedUp) return true;
  const paidEnough = Boolean(c.hasDeposit) || (c.totalPaidPence ?? 0) >= PAID_CONVERSION_THRESHOLD_PENCE;
  return paidEnough && Boolean(c.treatmentBooked);
}

function dashboardStatusLabel(c: {
  outcome: string | null;
  stuckReason: string | null;
  attended: boolean | null;
  planSignedUp: boolean;
  hasDeposit: boolean | null;
  totalPaidPence: number | null;
  treatmentBooked: boolean | null;
}): { label: string; key: string } {
  if (isLegacyConverted(c)) {
    return c.planSignedUp ? { label: "Completed", key: "completed" } : { label: "Converted", key: "converted" };
  }
  if (c.attended === true) {
    if (c.stuckReason === "FAILED_FINANCE") return { label: "Failed Finance", key: "failed-finance" };
    if (c.stuckReason === "PRICE_SHOPPING") return { label: "Price Shopping", key: "price-shopping" };
    if (c.stuckReason === "BAD_EXPERIENCE") return { label: "Bad Experience", key: "bad-experience" };
    if (c.stuckReason === "OUT_OF_BUDGET") return { label: "Out of Budget", key: "out-of-budget" };
    if (c.outcome === "THINKING") return { label: "Thinking", key: "thinking" };
    return { label: "Stuck", key: "stuck" };
  }
  if (c.outcome === "DECLINED") return { label: "Declined", key: "declined" };
  return { label: "New", key: "new" };
}

export async function getFlowDashboard(
  practiceId: string,
  opts?: { from?: Date; to?: Date; dentistId?: string | null }
): Promise<FlowDashboardData> {
  const db = scopedDb(practiceId);

  const consults = await db.consult.findMany({
    where: {
      ...(opts?.dentistId ? { practitionerDentistId: opts.dentistId } : {}),
    },
    include: {
      enquiry: { include: { patient: true } },
      practitionerDentist: true,
      appointment: true,
      reminders: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const filtered = consults.filter((c) => {
    const d = consultDate(c);
    if (opts?.from && d < opts.from) return false;
    if (opts?.to && d > opts.to) return false;
    return true;
  });

  const rows: FlowDashboardRow[] = filtered.map((c) => {
    const patient = c.enquiry.patient;
    const patientName = patient
      ? [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Unnamed patient"
      : "Unlinked lead";
    const d = consultDate(c);
    const planValue = planValuePence(c);
    const { label, key } = dashboardStatusLabel(c);

    return {
      id: c.id,
      patientId: patient?.id ?? null,
      patientName,
      patientEmail: patient?.email ?? null,
      patientPhone: patient?.phone ?? null,
      dentistId: c.practitionerDentistId,
      dentistName: c.practitionerDentist?.name ?? "Unassigned",
      bookedBy: c.bookedBy,
      consultationDate: d.toISOString().slice(0, 10),
      planValuePence: planValue,
      quotePence: c.quotePence,
      quotePenceOverride: c.quotePenceOverride,
      totalPaidPence: c.totalPaidPence ?? 0,
      attended: c.attended === true,
      hasPlan: planValue > 0,
      hasDeposit: c.hasDeposit === true,
      treatmentBooked: c.treatmentBooked === true,
      daysSinceConsult: Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000)),
      statusLabel: label,
      statusKey: key,
      planSignedUp: c.planSignedUp,
      touchPoints: c.reminders.filter((r) => r.sentAt != null).length,
      notes: c.notes,
    };
  });

  const attended = filtered.filter((c) => c.attended === true).length;
  const converted = filtered.filter((c) => isLegacyConverted(c)).length;
  const stuck = filtered.filter((c) => c.attended === true && !isLegacyConverted(c)).length;

  const stats: FlowDashboardStats = {
    totalConsultations: filtered.length,
    attended,
    converted,
    stuck,
    totalPlannedPence: filtered.reduce((sum, c) => sum + planValuePence(c), 0),
    totalPaidPence: filtered.reduce((sum, c) => sum + (c.totalPaidPence ?? 0), 0),
    planSignUps: filtered.filter((c) => c.planSignedUp).length,
    conversionRate: attended > 0 ? Math.round((converted / attended) * 100) : 0,
  };

  const dentistRows = await db.dentist.findMany({
    where: { practiceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const dentists = dentistRows.map((d) => ({ id: d.id, name: d.name }));

  return { stats, rows, dentists };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Funnel counts + conversion rate + a per-dentist breakdown, replicating the
 * "Quick Stats"/funnel numbers the old ElioFlow app actually surfaced
 * (pages/index.tsx: totalConsultations, attended, converted, stuck,
 * conversionRate = converted / attended, totalPipelineValue, totalPaid,
 * avg plan value, avg days to convert) rather than inventing new metrics.
 */
export async function getConversionReport(
  practiceId: string,
  dateRange?: { from: Date; to: Date },
) {
  const db = scopedDb(practiceId);
  const where = dateRange ? { createdAt: { gte: dateRange.from, lte: dateRange.to } } : {};

  const consults = await db.consult.findMany({
    where,
    include: { practitionerDentist: true },
  });

  const totalConsultations = consults.length;
  const attended = consults.filter((c) => c.attended === true).length;
  const converted = consults.filter((c) => c.outcome === "ACCEPTED").length;
  const declined = consults.filter((c) => c.outcome === "DECLINED").length;
  const thinking = consults.filter((c) => c.outcome === "THINKING").length;
  const closed = converted + declined;
  const conversionRate = closed > 0 ? Math.round((converted / closed) * 100) : 0;

  const quoted = consults.filter((c) => (c.quotePenceOverride ?? c.quotePence ?? 0) > 0);
  const totalPipelineValuePence = consults
    .filter((c) => c.outcome !== "ACCEPTED" && c.outcome !== "DECLINED")
    .reduce((sum, c) => sum + (c.quotePenceOverride ?? c.quotePence ?? 0), 0);
  const totalPlannedPence = consults.reduce((sum, c) => sum + (c.quotePenceOverride ?? c.quotePence ?? 0), 0);
  const totalPaidPence = consults.reduce((sum, c) => sum + (c.totalPaidPence ?? 0), 0);
  const averagePlanValuePence = quoted.length > 0 ? Math.round(totalPlannedPence / quoted.length) : 0;

  const convertedWithDates = consults.filter((c) => c.outcome === "ACCEPTED" && c.outcomeAt);
  const avgDaysToConvert =
    convertedWithDates.length > 0
      ? Math.round(
          convertedWithDates.reduce(
            (sum, c) => sum + (c.outcomeAt!.getTime() - c.createdAt.getTime()) / 86_400_000,
            0,
          ) / convertedWithDates.length,
        )
      : null;

  const byDentistMap = new Map<
    string,
    { dentistId: string | null; name: string; totalConsultations: number; converted: number; closed: number }
  >();
  for (const c of consults) {
    const key = c.practitionerDentistId ?? "unassigned";
    const name = c.practitionerDentist?.name ?? "Unassigned";
    const row = byDentistMap.get(key) ?? {
      dentistId: c.practitionerDentistId,
      name,
      totalConsultations: 0,
      converted: 0,
      closed: 0,
    };
    row.totalConsultations += 1;
    if (c.outcome === "ACCEPTED") row.converted += 1;
    if (c.outcome === "ACCEPTED" || c.outcome === "DECLINED") row.closed += 1;
    byDentistMap.set(key, row);
  }
  const byDentist = Array.from(byDentistMap.values()).map((row) => ({
    ...row,
    conversionRate: row.closed > 0 ? Math.round((row.converted / row.closed) * 100) : 0,
  }));

  return {
    totalConsultations,
    attended,
    converted,
    declined,
    thinking,
    stuck: thinking, // old ElioFlow's "stuck" == attended but not yet converted; THINKING is the closest live equivalent
    conversionRate,
    totalPipelineValuePence,
    totalPlannedPence,
    totalPaidPence,
    averagePlanValuePence,
    avgDaysToConvert,
    byDentist,
  };
}
