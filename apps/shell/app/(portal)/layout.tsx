import { redirect } from "next/navigation";
import { auth, can } from "@elio/auth";
import type { Role } from "@elio/db";
import { PortalLayout } from "@/components/portal-layout";

export default async function PortalRouteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.practiceId) redirect("/login");

  const role = session.role as Role;

  return (
    <PortalLayout userEmail={session.user?.email ?? undefined} role={role} canViewTeam={can({ role }, "team:view")}>
      {children}
    </PortalLayout>
  );
}
