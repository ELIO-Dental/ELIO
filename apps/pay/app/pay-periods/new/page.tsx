import { redirectToLogin, redirectUnlessPayViewAll } from "@/lib/session";
import { auth } from "@elio/auth";
import type { Role } from "@elio/db";
import { NewPayPeriodClient } from "./new-pay-period-client";

export default async function NewPayPeriodPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  await redirectUnlessPayViewAll(session.role as Role);
  return <NewPayPeriodClient />;
}
