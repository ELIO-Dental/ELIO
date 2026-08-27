import { redirect } from "next/navigation";

// Root of this module's zone — redirect to the real dashboard (matches
// apps/pay's pattern where the module root IS the dashboard; here the nav
// links to /plans/dashboard specifically, so keep that as the one real
// implementation and just redirect here rather than duplicating it).
// Must be a RELATIVE path without the "/plans" basePath prefix — Next.js
// auto-adds it for a Server Component redirect, so "/plans/dashboard" here
// would become "/plans/plans/dashboard" and 404 (confirmed live).
export default function PlansRootPage() {
  redirect("/dashboard");
}
