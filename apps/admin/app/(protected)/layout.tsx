import { redirect } from "next/navigation";
import { PageTransition } from "@elio/ui";
import { auth } from "@/lib/auth";
import { AdminNav } from "@/components/admin-nav";

/**
 * Step 2.3 — the REAL, verified auth gate for every protected admin route.
 * Placed at the layout level (matches apps/pay/app/layout.tsx's pattern from
 * Step 2.2) rather than middleware.ts, since a live investigation this
 * session found middleware's custom callback does not reliably execute under
 * this exact Next.js dev setup — next/navigation's redirect() from a Server
 * Component IS proven to work. /login lives OUTSIDE this route group, so it
 * never passes through this check (no redirect loop).
 */
export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const role = (session as any)?.role as string | undefined;
  if (!session || role !== "SUPER_ADMIN") {
    redirect("/login");
  }

  return (
    <AdminNav>
      <PageTransition>{children}</PageTransition>
    </AdminNav>
  );
}
