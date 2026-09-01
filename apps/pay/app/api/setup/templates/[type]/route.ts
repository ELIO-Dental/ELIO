import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { entityTemplateCsv } from "@/lib/setup-import/import-entities";
import { dentistTemplateCsv } from "@/lib/setup-import/import-dentists";
import { PAY_SETTINGS_KEYS, defaultPaySettings } from "@/lib/pay-settings";

export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    await requirePermission("pay:view");
    const { type } = await params;

    let csv = "";
    let filename = "template.csv";

    if (type === "labs" || type === "suppliers") {
      csv = entityTemplateCsv();
      filename = `${type}-template.csv`;
    } else if (type === "dentists") {
      csv = dentistTemplateCsv();
      filename = "dentists-template.csv";
    } else if (type === "settings") {
      const defaults = defaultPaySettings();
      const headers = [...PAY_SETTINGS_KEYS];
      const row = headers.map((key) => `"${defaults[key]}"`).join(",");
      csv = `${headers.join(",")}\n${row}`;
      filename = "pay-settings-template.csv";
    } else {
      return NextResponse.json({ error: "Unknown template type" }, { status: 404 });
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
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
