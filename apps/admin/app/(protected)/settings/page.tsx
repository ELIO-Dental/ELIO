import { redirect } from "next/navigation";
import { prisma } from "@elio/db";
import { PageHeader } from "@elio/ui";
import { auth } from "@/lib/auth";
import { ChangePasswordForm, MfaEnrollmentCard } from "./settings-client";

export default async function AdminSettingsPage() {
  const session = await auth();
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, mfaEnabled: true, mfaSecret: true },
  });

  const mfaComplete = Boolean(user.mfaEnabled && user.mfaSecret);

  return (
    <div className="space-y-8 pb-8 md:pb-0">
      <PageHeader
        title="Settings"
        description={
          mfaComplete
            ? "Manage your Super Admin sign-in security."
            : "Complete authenticator setup first, then change your password if needed."
        }
      />

      {!mfaComplete && (
        <div
          className="rounded-(--radius-lg) border border-(--color-warning)/30 bg-(--color-warning-bg) px-4 py-3 text-body-sm text-(--color-text-primary)"
          data-testid="mfa-setup-banner"
        >
          First-time setup: enroll your authenticator below before opening the tenant list.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <MfaEnrollmentCard mfaEnabled={mfaComplete} email={user.email} />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
