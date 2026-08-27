import { redirect } from "next/navigation";

// Root of this module's zone — redirect to the real dashboard (matches
// apps/pay's pattern where the module root IS the dashboard; here the nav
// links to /plans/dashboard specifically, so keep that as the one real
// implementation and just redirect here rather than duplicating it).
export default function PlansRootPage() {
  redirect("/plans/dashboard");
}
