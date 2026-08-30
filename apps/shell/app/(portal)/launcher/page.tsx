import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLicenceStatus } from "@elio/auth";
import { LauncherDashboard } from "@/components/launcher-dashboard";

const MODULES = [
  { moduleId: "pay" as const, licenceModuleId: "PAY" as const, name: "ElioPay", description: "Run payroll & pay periods", href: "/pay" },
  { moduleId: "plans" as const, licenceModuleId: "PLANS" as const, name: "ElioPlans", description: "Patient membership plans", href: "/plans" },
  { moduleId: "flow" as const, licenceModuleId: "FLOW" as const, name: "ElioFlow", description: "Practice workflow & scheduling", href: "/flow" },
];

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function LauncherPage() {
  const session = await auth();
  if (!session?.practiceId) redirect("/login");

  const email = session.user?.email ?? "";
  const displayName = email ? displayNameFromEmail(email) : "there";

  const licenceChecks = await Promise.all(MODULES.map((mod) => getLicenceStatus(session.practiceId!, mod.licenceModuleId)));

  const modules = MODULES.map((mod, i) => {
    const { licensed, trialEndsAt } = licenceChecks[i]!;
    return {
      moduleId: mod.moduleId,
      name: mod.name,
      description: mod.description,
      href: mod.href,
      licensed,
      trialEndsAt: trialEndsAt ?? null,
    };
  });

  return <LauncherDashboard displayName={displayName} modules={modules} />;
}
