import { redirect } from "next/navigation";
import { prisma } from "@elio/db";
import type { Role } from "@elio/db";
import { auth } from "@/lib/auth";
import { Avatar, Badge, Card, CardContent, CardHeader, CardTitle, PageContent, PageHeader } from "@elio/ui";
import { ChangePasswordForm } from "./profile-client";

function roleLabel(role: Role): string {
  switch (role) {
    case "OWNER":
      return "Owner";
    case "ADMIN":
      return "Admin";
    case "FINANCE":
      return "Finance";
    case "STAFF":
      return "Staff";
    case "AUDITOR":
      return "Auditor";
    default:
      return role;
  }
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "U";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function ProfileSettingsPage() {
  const session = await auth();
  if (!session?.userId || !session.practiceId) redirect("/login");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: {
      email: true,
      role: true,
      mfaEnabled: true,
      createdAt: true,
      practice: { select: { name: true } },
    },
  });

  const role = user.role as Role;
  const displayName = displayNameFromEmail(user.email);

  return (
    <PageContent width="md">
      <PageHeader title="Profile" description="Your account details and sign-in security." />

      <div className="mt-8 space-y-8">
        <Card className="border-(--color-border-subtle) shadow-(--shadow-sm)">
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4">
              <Avatar size="lg" initials={initialsFromEmail(user.email)} />
              <div className="min-w-0 flex-1 space-y-4">
                <div>
                  <p className="text-body font-semibold text-(--color-text-primary)">{displayName}</p>
                  <p className="text-body-sm text-(--color-text-secondary)">{user.email}</p>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-caption font-medium text-(--color-text-tertiary)">Practice</dt>
                    <dd className="text-body-sm text-(--color-text-primary)">{user.practice.name}</dd>
                  </div>
                  <div>
                    <dt className="text-caption font-medium text-(--color-text-tertiary)">Role</dt>
                    <dd>
                      <Badge variant="neutral">{roleLabel(role)}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption font-medium text-(--color-text-tertiary)">Two-factor auth</dt>
                    <dd>
                      <Badge variant={user.mfaEnabled ? "success" : "neutral"}>{user.mfaEnabled ? "Enabled" : "Not enabled"}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption font-medium text-(--color-text-tertiary)">Member since</dt>
                    <dd className="text-body-sm text-(--color-text-primary)">{formatDate(user.createdAt)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </CardContent>
        </Card>

        <ChangePasswordForm />
      </div>
    </PageContent>
  );
}
