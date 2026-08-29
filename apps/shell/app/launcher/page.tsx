import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getModuleColor } from "@elio/ui";
import { getLicenceStatus } from "@elio/auth";
import { Card, CardContent, CardHeader, CardTitle, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Badge } from "@elio/ui";
import { Lock } from "lucide-react";

/** Whole-day count, always rounding UP so "expires in 3 hours" still reads
 * as "1 day left" rather than misleadingly "0 days left". */
function daysLeft(trialEndsAt: Date): number {
  return Math.max(1, Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

const MODULES = [
  { moduleId: "pay" as const, licenceModuleId: "PAY" as const, name: "ElioPay", description: "Run payroll & pay periods", href: "/pay" },
  { moduleId: "plans" as const, licenceModuleId: "PLANS" as const, name: "ElioPlans", description: "Patient membership plans", href: "/plans" },
  { moduleId: "flow" as const, licenceModuleId: "FLOW" as const, name: "ElioFlow", description: "Practice workflow & scheduling", href: "/flow" },
];

/**
 * Post-login landing — grid of module tiles. Step 2.2 (FR-3): an unlicensed
 * module renders greyed-out with a lock badge + tooltip, per
 * THEME_GUIDELINE.md §5.5 — clicking does not navigate. This is a UI hint on
 * top of the real enforcement, which lives server-side in each zone's own
 * middleware.ts (a direct URL is blocked there regardless of what this page
 * shows).
 */
export default async function LauncherPage() {
  const session = await auth();
  if (!session?.practiceId) redirect("/login");

  const licenceChecks = await Promise.all(MODULES.map((mod) => getLicenceStatus(session.practiceId!, mod.licenceModuleId)));

  return (
    <div className="min-h-screen bg-(--color-bg) px-6 py-12">
      {/* Found live (2026-08-29, independent Phase 2 audit): max-w-3xl left
          over 90% of a 1440px viewport blank — widened to max-w-6xl to match
          every other real dashboard page's convention (apps/pay's own
          dashboard, apps/plans' dashboard), and the grid now scales to more
          columns at wider breakpoints instead of staying pinned at 3 forever
          (ready for Phase 3's reserved additional modules without another
          redesign, per THEME_GUIDELINE.md §8's "anticipate Phase 3" note). */}
      <div className="mx-auto max-w-6xl">
        <h1 className="text-h2 text-(--color-text-primary)">Welcome back</h1>
        <p className="mt-1 text-body text-(--color-text-secondary)">Choose a module to get started.</p>

        <TooltipProvider>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="launcher-grid">
            {MODULES.map((mod, i) => {
              const color = getModuleColor(mod.moduleId);
              const { licensed, trialEndsAt } = licenceChecks[i]!;

              const tile = (
                <Card interactive={licensed} accentColor={licensed ? color.hex : undefined} className={!licensed ? "opacity-50 grayscale" : undefined}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <span
                        className="flex size-9 items-center justify-center rounded-(--radius-md) text-body-sm font-semibold"
                        style={{ backgroundColor: color.badgeLight.bg, color: color.badgeLight.fg }}
                      >
                        {mod.name.replace("Elio", "").slice(0, 1)}
                      </span>
                      {!licensed && <Lock className="size-4 text-(--color-text-tertiary)" aria-label="Locked" />}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardTitle>{mod.name}</CardTitle>
                    <p className="mt-1 text-body-sm text-(--color-text-secondary)">{mod.description}</p>
                    {licensed && trialEndsAt && (
                      <Badge variant="warning" className="mt-2" data-testid={`trial-badge-${mod.moduleId}`}>
                        Trial — {daysLeft(trialEndsAt)} day{daysLeft(trialEndsAt) === 1 ? "" : "s"} left
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );

              if (!licensed) {
                return (
                  <Tooltip key={mod.moduleId}>
                    <TooltipTrigger asChild>
                      <div data-testid={`launcher-tile-${mod.moduleId}`} data-locked="true" className="cursor-not-allowed">
                        {tile}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Contact admin to enable</TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <a key={mod.moduleId} href={mod.href} data-testid={`launcher-tile-${mod.moduleId}`}>
                  {tile}
                </a>
              );
            })}
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
