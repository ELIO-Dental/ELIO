// ElioFlow business logic — Step 1.8 (MASTER_BUILD_GUIDE.md §1.8).
// Mirrors apps/plans/lib/plans-service.ts's convention: scopedDb() for every
// tenant-owned read/write, writeAuditLog() for anything that changes state a
// user might need to trace, plain Error throws for the route layer to map.
import { scopedDb } from "@elio/db";
import { writeAuditLog } from "@elio/auth";
import { getAppointments, getInvoices } from "@elio/dentally";

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
  },
) {
  const db = scopedDb(practiceId);
  const consult = await db.consult.findUnique({ where: { id: consultId } });
  if (!consult) throw new Error("Consult not found");
  return db.consult.update({ where: { id: consultId }, data: input });
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
  if (!practitionerDentistId && appointment.practitionerId) {
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

/**
 * Sync `Consult.totalPaidPence` from the patient's Dentally-synced invoices
 * — a read-only mirror (see the field's schema comment), never ElioFlow's
 * own source of truth. Sums every synced Invoice.totalPence for the
 * patient; this is an approximation (old ElioFlow summed real *payments*,
 * which packages/dentally's synced core does not currently store — only
 * Invoice totals are available today, see DATA_MODEL.md §5's 2026-08-19
 * entry for this as a known, documented limitation).
 */
export async function syncConsultFinancials(practiceId: string, consultId: string) {
  const db = scopedDb(practiceId);
  const consult = await db.consult.findUnique({
    where: { id: consultId },
    include: { enquiry: true },
  });
  if (!consult) throw new Error("Consult not found");
  if (!consult.enquiry.patientId) throw new Error("Consult's enquiry has no linked patient — link a patient first");

  const invoices = await getInvoices(practiceId, { patientId: consult.enquiry.patientId, take: 200 });
  const totalPaidPence = invoices.reduce((sum, inv) => sum + (inv.totalPence ?? 0), 0);

  return db.consult.update({ where: { id: consultId }, data: { totalPaidPence } });
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
