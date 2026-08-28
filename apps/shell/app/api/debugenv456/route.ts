import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    PAY_APP_ORIGIN: process.env.PAY_APP_ORIGIN ?? null,
    PLANS_APP_ORIGIN: process.env.PLANS_APP_ORIGIN ?? null,
    FLOW_APP_ORIGIN: process.env.FLOW_APP_ORIGIN ?? null,
  });
}
