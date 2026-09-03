import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "./session";

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

/** Shared route-handler error -> NextResponse mapping (ENGINEERING_CONVENTIONS.md). */
export function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
  if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof BadRequestError) return NextResponse.json({ error: err.message }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
}
