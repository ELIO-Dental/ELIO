import { can, requireLicensedSession } from "@/lib/session";
import type { Role } from "@elio/db";
import { listRedeemRules } from "@/lib/plans-service";
import { getAllPlanSettings, getBrandingSettings, getGoCardlessEnvStatus } from "@/lib/plans-settings";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, PageContent, PageHeader } from "@elio/ui";
import { RedeemRuleToggle } from "./redeem-rule-toggle";
import { SettingsManager } from "./settings-manager";

export default async function SettingsPage() {
  const session = await requireLicensedSession();
  const canEdit = can({ role: session.role as Role }, "plans:edit-settings");

  const [settings, branding, redeemRules] = await Promise.all([
    getAllPlanSettings(session.practiceId),
    getBrandingSettings(session.practiceId),
    listRedeemRules(session.practiceId),
  ]);

  const gocardless = getGoCardlessEnvStatus();

  return (
    <PageContent width="md">
      <PageHeader
        title="Settings"
        description="Practice configuration for Plans — branding, GoCardless, membership terms, and payment rules."
      />

      <div className="mt-8 space-y-6">
        <SettingsManager
          initialSettings={settings}
          initialBranding={branding}
          gocardless={gocardless}
          canEdit={canEdit}
        />

        <Card>
          <CardHeader>
            <CardTitle>Redeem approval policy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-body-sm text-(--color-text-secondary)">
              Whether a redemption request needs staff approval before it&apos;s granted.
            </p>
            {redeemRules.length === 0 ? (
              <EmptyState
                title="No redeem rules yet"
                description="Create redeem rules from a plan to configure approval policy."
              />
            ) : (
              <div className="divide-y divide-(--color-border)">
                {redeemRules.map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-body font-medium text-(--color-text-primary)">{rule.name}</p>
                      <p className="text-body-sm text-(--color-text-tertiary)">{rule.plan.name}</p>
                    </div>
                    {canEdit ? (
                      <RedeemRuleToggle redeemRuleId={rule.id} initialRequiresApproval={rule.requiresApproval} />
                    ) : (
                      <Badge variant={rule.requiresApproval ? "warning" : "success"}>
                        {rule.requiresApproval ? "Requires approval" : "Auto-approved"}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reconciliation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-body-sm text-(--color-text-secondary)">
              Runs daily via <code className="font-(--font-mono)">/plans/api/cron/reconcile-payments</code>. View
              results on the Reconciliation screen.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageContent>
  );
}
