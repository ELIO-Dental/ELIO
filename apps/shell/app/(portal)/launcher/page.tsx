import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getModuleColor, ModuleIconBadge, ModuleAccentChip } from "@elio/ui";
import { getLicenceStatus } from "@elio/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Badge,
  PageContent,
} from "@elio/ui";
import { ArrowUpRight, Lock, Sparkles } from "lucide-react";

function daysLeft(trialEndsAt: Date): number {
  return Math.max(1, Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const MODULES = [
  { moduleId: "pay" as const, licenceModuleId: "PAY" as const, name: "ElioPay", description: "Run payroll & pay periods", href: "/pay" },
  { moduleId: "plans" as const, licenceModuleId: "PLANS" as const, name: "ElioPlans", description: "Patient membership plans", href: "/plans" },
  { moduleId: "flow" as const, licenceModuleId: "FLOW" as const, name: "ElioFlow", description: "Practice workflow & scheduling", href: "/flow" },
];

export default async function LauncherPage() {
  const session = await auth();
  if (!session?.practiceId) redirect("/login");

  const email = session.user?.email ?? "";
  const displayName = email ? displayNameFromEmail(email) : "there";

  const licenceChecks = await Promise.all(MODULES.map((mod) => getLicenceStatus(session.practiceId!, mod.licenceModuleId)));

  return (
    <PageContent>
      <header className="relative overflow-hidden rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-8 shadow-(--shadow-sm) md:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-(--color-primary-500)/10 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-(--radius-full) bg-(--color-primary-500)/10 px-3 py-1 text-caption font-medium text-(--color-primary-600)">
            <Sparkles className="size-3.5" aria-hidden />
            ELIO Portal
          </p>
          <h1 className="mt-4 text-h1 text-(--color-text-primary)">
            Welcome back{displayName !== "there" ? `, ${displayName}` : ""}
          </h1>
          <p className="mt-2 max-w-2xl text-body leading-relaxed text-(--color-text-secondary)">
            Access your ELIO platform suite — pick a module to open its workspace.
          </p>
        </div>
      </header>

      <section className="mt-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-h2 text-(--color-text-primary)">Your ELIO Products</h2>
            <p className="mt-1 text-body-sm text-(--color-text-secondary)">Licensed modules for your practice</p>
          </div>
        </div>

        <TooltipProvider>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="launcher-grid">
              {MODULES.map((mod, i) => {
                const color = getModuleColor(mod.moduleId);
                const { licensed, trialEndsAt } = licenceChecks[i]!;

                const tile = (
                  <Card
                    interactive={licensed}
                    accentColor={licensed ? color.hex : undefined}
                    className={!licensed ? "opacity-55 grayscale" : "group relative h-full"}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <ModuleIconBadge moduleId={mod.moduleId} size="lg">
                          {mod.name.replace("Elio", "").slice(0, 1)}
                        </ModuleIconBadge>
                        {licensed ? (
                          <ModuleAccentChip
                            moduleId={mod.moduleId}
                            className="size-9 transition-transform group-hover:scale-110"
                          >
                            <ArrowUpRight className="size-4" aria-hidden />
                          </ModuleAccentChip>
                        ) : (
                          <Lock className="size-4 shrink-0 text-(--color-text-tertiary)" aria-label="Locked" />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardTitle>{mod.name}</CardTitle>
                      <p className="mt-2 text-body-sm leading-relaxed text-(--color-text-secondary)">{mod.description}</p>
                      {licensed && trialEndsAt && (
                        <Badge variant="warning" className="mt-4" data-testid={`trial-badge-${mod.moduleId}`}>
                          Trial — {daysLeft(trialEndsAt)} day{daysLeft(trialEndsAt) === 1 ? "" : "s"} left
                        </Badge>
                      )}
                      {!licensed && (
                        <p className="mt-4 text-caption font-medium text-(--color-text-tertiary)">No active licence</p>
                      )}
                    </CardContent>
                  </Card>
                );

                if (!licensed) {
                  return (
                    <Tooltip key={mod.moduleId}>
                      <TooltipTrigger asChild>
                        <div data-testid={`launcher-tile-${mod.moduleId}`} data-locked="true" className="h-full cursor-not-allowed">
                          {tile}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Contact admin to enable</TooltipContent>
                    </Tooltip>
                  );
                }

                return (
                  <a key={mod.moduleId} href={mod.href} data-testid={`launcher-tile-${mod.moduleId}`} className="block h-full">
                    {tile}
                  </a>
                );
              })}
          </div>
        </TooltipProvider>
      </section>
    </PageContent>
  );
}
