import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function tryList(p: string) {
  try {
    return fs.readdirSync(p);
  } catch (e) {
    return `ERROR: ${(e as Error).message}`;
  }
}

export async function GET() {
  const candidates = [
    "/var/task/apps/shell/packages/db/generated/client",
    "/var/task/packages/db/generated/client",
    "/vercel/path0/packages/db/generated/client",
    path.join(process.cwd(), "packages/db/generated/client"),
    path.join(process.cwd(), "../../packages/db/generated/client"),
  ];
  const result: Record<string, unknown> = { cwd: process.cwd() };
  for (const c of candidates) {
    result[c] = tryList(c);
  }
  return NextResponse.json(result);
}
