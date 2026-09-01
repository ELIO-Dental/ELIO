import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { exportEntities } from "@/lib/setup-import/import-entities";
import { exportDentists } from "@/lib/setup-import/import-dentists";
import { getPaySettings } from "@/lib/pay-settings-service";
import { PAY_SETTINGS_KEYS, paySettingsForExport } from "@/lib/pay-settings";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("pay:view");
    const type = new URL(req.url).searchParams.get("type");

    let csv = "";
    let filename = "export.csv";

    if (type === "labs") {
      csv = await exportEntities(session.practiceId, "lab");
      filename = "labs.csv";
    } else if (type === "suppliers") {
      csv = await exportEntities(session.practiceId, "supplier");
      filename = "suppliers.csv";
    } else if (type === "dentists") {
      csv = await exportDentists(session.practiceId);
      filename = "dentists.csv";
    } else if (type === "settings") {
      const settings = paySettingsForExport(await getPaySettings(session.practiceId));
      const headers = [...PAY_SETTINGS_KEYS];
      const row = headers.map((key) => `"${(settings[key] ?? "").replace(/"/g, '""')}"`).join(",");
      csv = `${headers.join(",")}\n${row}`;
      filename = "pay-settings.csv";
    } else {
      return NextResponse.json({ error: "type must be labs, suppliers, dentists, or settings" }, { status: 400 });
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}
