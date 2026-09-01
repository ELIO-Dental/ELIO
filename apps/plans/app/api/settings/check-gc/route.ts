import { NextResponse } from "next/server";
import { getGoCardlessClient } from "@elio/plans-engine";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getGoCardlessEnvStatus } from "@/lib/plans-settings";

/** Diagnose GoCardless connection (legacy check-gc-connection, P4.4). */
export async function GET() {
  try {
    await requirePermission("plans:edit-settings");

    const diagnostics: Record<string, unknown> = {
      ...getGoCardlessEnvStatus(),
      clientInitialized: false,
    };

    const client = getGoCardlessClient();
    diagnostics.clientInitialized = !!client;

    if (client) {
      try {
        const response = await client.customers.list({ limit: 1 });
        diagnostics.apiConnected = true;
        diagnostics.customerCount = response?.customers?.length ?? 0;
      } catch (err) {
        diagnostics.apiConnected = false;
        diagnostics.apiError = err instanceof Error ? err.message : String(err);
      }
    }

    return NextResponse.json(diagnostics);
  } catch (e) {
    return errorResponse(e);
  }
}
