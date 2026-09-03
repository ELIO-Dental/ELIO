import { prisma, scopedDb } from "@elio/db";
import { BadRequestError } from "./api-error";

export async function listPlanPatientNotes(practiceId: string, planPatientId: string) {
  const db = scopedDb(practiceId);
  const planPatient = await db.planPatient.findFirst({ where: { id: planPatientId } });
  if (!planPatient) return null;

  return db.planPatientNote.findMany({
    where: { planPatientId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { email: true } } },
  });
}

export async function addPlanPatientNote(
  practiceId: string,
  planPatientId: string,
  authorId: string,
  content: string,
) {
  const trimmed = content.trim();
  if (!trimmed) throw new BadRequestError("Note content is required");

  const db = scopedDb(practiceId);
  const planPatient = await db.planPatient.findFirst({ where: { id: planPatientId } });
  if (!planPatient) throw new BadRequestError("Plan patient not found");

  return db.planPatientNote.create({
    data: { practiceId, planPatientId, authorId, content: trimmed },
    include: { author: { select: { email: true } } },
  });
}

export async function listPlanEmailLogs(practiceId: string, planPatientId: string) {
  const db = scopedDb(practiceId);
  const planPatient = await db.planPatient.findFirst({ where: { id: planPatientId } });
  if (!planPatient) return null;

  return db.planEmailLog.findMany({
    where: { planPatientId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { sentBy: { select: { email: true } } },
  });
}

/** Persist outbound email for the Correspondence tab (legacy EmailLog). */
export async function logPlanEmail(input: {
  practiceId: string;
  planPatientId: string;
  to: string;
  subject: string;
  type: string;
  status: "sent" | "failed";
  messageId?: string | null;
  sentById?: string | null;
  error?: string | null;
}) {
  await prisma.planEmailLog.create({
    data: {
      practiceId: input.practiceId,
      planPatientId: input.planPatientId,
      to: input.to,
      subject: input.subject,
      type: input.type,
      status: input.status,
      messageId: input.messageId ?? null,
      sentById: input.sentById ?? null,
      error: input.error ?? null,
    },
  });
}
