import { NextRequest, NextResponse } from "next/server";
import {
  DentallySyncConfigError,
  fetchDentallyPatient,
  searchDentallyPatients,
} from "@elio/dentally";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Search Dentally patients for manual import (P1.4). */
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission("plans:invite-patients");
    const query = req.nextUrl.searchParams.get("q");

    if (!query || query.length < 2) {
      return NextResponse.json({ error: "Search query must be at least 2 characters" }, { status: 400 });
    }

    const numericId = parseInt(query, 10);
    if (!Number.isNaN(numericId) && String(numericId) === query.trim()) {
      const patient = await fetchDentallyPatient(session.practiceId, query);
      return NextResponse.json({
        patients: patient ? [patient] : [],
        configured: true,
      });
    }

    const patients = await searchDentallyPatients(session.practiceId, query);
    return NextResponse.json({ patients, configured: true });
  } catch (e) {
    if (e instanceof DentallySyncConfigError) {
      return NextResponse.json(
        { error: "Dentally is not configured. Add your API key in Settings.", configured: false },
        { status: 400 },
      );
    }
    return errorResponse(e);
  }
}
