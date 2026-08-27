import { requireLicensedSession, can } from "@/lib/session";
import type { Role } from "@elio/db";
import { PlansNav } from "@/components/plans-nav";
import { listRedeemRules } from "@/lib/plans-service";
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState } from "@elio/ui";
import { RedeemRuleToggle } from "./redeem-rule-toggle";

/**
 * Settings (MASTER_BUILD_GUIDE.md §1.7) — plans-module-specific configuration
 * only, each backed by a real field: GoCardless connection status (env var
 * presence — packages/plans-engine/src/gocardless.ts reads
 * GOCARDLESS_ACCESS_TOKEN/GOCARDLESS_ENVIRONMENT/GOCARDLESS_WEBHOOK_SECRET
 * directly, there's no DB field for this so it's shown read-only, not
 * editable here), redeem approval policy (PlanRedeemRule.requiresApproval,
 * real + editable, gated by plans:edit-settings per PERMISSIONS_MATRIX.md
 * §4), and reconciliation (informational — the cron route + BUG-1's
 * idempotency guarantee, no schedule field exists to edit).
 */
export default async function SettingsPage() {
  const session = await requireLicensedSession();
  const canEdit = can({ role: session.role as Role }, "plans:edit-settings");

  const redeemRules = await listRedeemRules(session.practiceId);

  const accessTokenSet = !!process.env.GOCARDLESS_ACCESS_TOKEN;
  const webhookSecretSet = !!process.env.GOCARDLESS_WEBHOOK_SECRET;
  const environment = process.env.GOCARDLESS_ENVIRONMENT || "sandbox";

  return (
    <div>
      <PlansNav />
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-h2 text-[--color-text-primary]">Settings</h1>
        <p className="mt-1 text-body text-[--color-text-secondary]">
          Plans-module configuration. Practice-wide settings (users, MFA) live under Users.
        </p>

        <div className="mt-8 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>GoCardless connection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={accessTokenSet ? "success" : "danger"}>
                  {accessTokenSet ? "Access token configured" : "Access token missing"}
                </Badge>
                <Badge variant={webhookSecretSet ? "success" : "danger"}>
                  {webhookSecretSet ? "Webhook secret configured" : "Webhook secret missing"}
                </Badge>
                <Badge variant="neutral">Environment: {environment}</Badge>
              </div>
              <p className="mt-3 text-body-sm text-[--color-text-secondary]">
                Set via environment variables — connection credentials aren&apos;t editable from
                this screen.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Redeem approval policy</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-body-sm text-[--color-text-secondary]">
                Whether a redemption request needs staff approval before it&apos;s granted. Turned
                off, matching redeems are auto-approved on request.
              </p>
              {redeemRules.length === 0 ? (
                <EmptyState title="No redeem rules yet" description="Create redeem rules from a plan to configure approval policy." />
              ) : (
                <div className="divide-y divide-[--color-border]">
                  {redeemRules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-body font-medium text-[--color-text-primary]">{rule.name}</p>
                        <p className="text-body-sm text-[--color-text-tertiary]">{rule.plan.name}</p>
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
              <p className="text-body-sm text-[--color-text-secondary]">
                Runs daily via <code className="font-[--font-mono]">/plans/api/cron/reconcile-payments</code>, comparing
                expected charges and local payments against GoCardless. Idempotent charge creation
                (BUG-1&apos;s fix) guarantees one payment row per billing period regardless of
                webhook retries. View results on the Reconciliation screen.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
