import { redirect } from "next/navigation";
import { prisma } from "@elio/db";

/** Redirect to Settings until Super Admin has enrolled MFA (first-time setup). */
export async function requireMfaComplete(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true, mfaSecret: true },
  });
  if (!user?.mfaEnabled || !user.mfaSecret) {
    redirect("/settings");
  }
}
