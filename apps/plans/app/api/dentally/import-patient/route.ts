import { NextResponse } from "next/server";
import { findExistingPatient, normalizeEmail } from "@elio/dentally";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { enrolPatient } from "@/lib/plans-service";

/** Import a single patient from Dentally search (P2.4). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const db = scopedDb(session.practiceId);
    const body = await req.json();

    const dentallyId = typeof body?.dentallyId === "string" ? body.dentallyId.trim() : "";
    if (!dentallyId) {
      return NextResponse.json({ error: "dentallyId is required" }, { status: 400 });
    }

    const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
    const email = normalizeEmail(typeof body?.email === "string" ? body.email : null);
    const phone =
      (typeof body?.mobile === "string" ? body.mobile : null) ||
      (typeof body?.phone === "string" ? body.phone : null) ||
      null;

    const existingPatients = await db.patient.findMany({
      select: { id: true, dentallyId: true, email: true, firstName: true, lastName: true },
    });

    const { match, matchedBy } = findExistingPatient({ dentallyId, email: email ?? undefined }, existingPatients);

    let patientId: string;
    if (match) {
      patientId = match.id;
      const updates: {
        dentallyId?: string;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
        phone?: string | null;
      } = {};
      if (matchedBy === "email" && !match.dentallyId) updates.dentallyId = dentallyId;
      if (firstName) updates.firstName = firstName;
      if (lastName) updates.lastName = lastName;
      if (email) updates.email = email;
      if (phone) updates.phone = phone;
      if (Object.keys(updates).length > 0) {
        await db.patient.update({ where: { id: patientId }, data: updates });
      }
    } else {
      const patient = await db.patient.create({
        data: {
          practiceId: session.practiceId,
          dentallyId,
          firstName: firstName || null,
          lastName: lastName || null,
          email,
          phone,
        },
      });
      patientId = patient.id;
    }

    const planId = typeof body?.planId === "string" ? body.planId : "";
    const parentPatientId = typeof body?.parentPatientId === "string" ? body.parentPatientId.trim() : undefined;
    if (planId) {
      const enrolment = await enrolPatient(session.practiceId, { patientId, planId, parentPatientId });
      return NextResponse.json({
        patientId,
        created: !match,
        matchedBy,
        signupUrl: enrolment.signupToken ? `/plans/signup/${enrolment.signupToken}` : null,
      });
    }

    return NextResponse.json({ patientId, created: !match, matchedBy });
  } catch (e) {
    return errorResponse(e);
  }
}
