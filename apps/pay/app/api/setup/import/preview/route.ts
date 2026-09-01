import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { previewEntityImportFromCsv } from "@/lib/setup-import/import-entities";
import { previewDentistImport } from "@/lib/setup-import/import-dentists";
import { parseCsvText, rowToRecord } from "@/lib/setup-import/parse-csv";
import { PAY_SETTINGS_KEYS } from "@/lib/pay-settings";
import type { ImportMode } from "@/lib/setup-import/validate-entities";

function parseMode(value: unknown): ImportMode {
  if (value === "create" || value === "replace") return value;
  return "upsert";
}

export async function POST(req: Request) {
  try {
    await requirePermission("practice:manage");
    const body = (await req.json()) as { type?: string; csv?: string; mode?: string };
    const type = body.type;
    const csv = typeof body.csv === "string" ? body.csv : "";
    const mode = parseMode(body.mode);

    if (!type || !csv.trim()) {
      return NextResponse.json({ error: "type and csv are required" }, { status: 400 });
    }

    if (type === "labs" || type === "suppliers") {
      const preview = previewEntityImportFromCsv(csv);
      return NextResponse.json({ ok: true, mode, ...preview, created: 0, updated: 0, skipped: 0 });
    }

    if (type === "dentists") {
      const preview = previewDentistImport(csv);
      return NextResponse.json({ ok: true, mode, ...preview, warnings: [], created: 0, updated: 0, skipped: 0 });
    }

    if (type === "settings") {
      const parsed = parseCsvText(csv);
      if (parsed.rows.length === 0) {
        return NextResponse.json({ error: "No settings row found" }, { status: 400 });
      }
      const record = rowToRecord(parsed.headers, parsed.rows[0]!);
      const settings: Record<string, string> = {};
      for (const key of PAY_SETTINGS_KEYS) {
        if (record[key] != null) settings[key] = record[key];
      }
      return NextResponse.json({
        ok: true,
        mode,
        settings,
        valid: [{ settings }],
        errors: [],
        warnings: [],
        created: 0,
        updated: 0,
        skipped: 0,
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return errorResponse(err);
  }
}
