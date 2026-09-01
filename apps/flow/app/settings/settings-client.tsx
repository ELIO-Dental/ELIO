"use client";

import * as React from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageContent,
  PageHeader,
  toast,
} from "@elio/ui";
import type { FlowSettings } from "@elio/dentally";

export function FlowSettingsClient({
  initialSettings,
  canEdit,
}: {
  initialSettings: FlowSettings;
  canEdit: boolean;
}) {
  const [settings, setSettings] = React.useState(initialSettings);
  const [saving, setSaving] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch("/flow/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planDisplayName: settings.planDisplayName,
          cosmeticConsultReason: settings.cosmeticConsultReason,
          depositThresholdPence: Number(settings.depositThresholdPence),
          paidConversionThresholdPence: Number(settings.paidConversionThresholdPence),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to save settings");
      setSettings(body.settings);
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Couldn't save settings", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContent width="md">
      <PageHeader
        title="Settings"
        description="Configure Flow pipeline rules — plan name, cosmetic consult import filter, and conversion thresholds."
      />

      <form className="mt-8 space-y-6" onSubmit={save} data-testid="flow-settings-form">
        <Card>
          <CardHeader>
            <CardTitle>Plan & import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="planDisplayName">Plan display name</Label>
              <Input
                id="planDisplayName"
                value={settings.planDisplayName}
                disabled={!canEdit}
                onChange={(e) => setSettings((s) => ({ ...s, planDisplayName: e.target.value }))}
                placeholder="AuraCare"
              />
              <p className="mt-1 text-caption text-(--color-text-tertiary)">
                Shown on the dashboard stat card for plan sign-ups.
              </p>
            </div>
            <div>
              <Label htmlFor="cosmeticConsultReason">Cosmetic consult reason filter</Label>
              <Input
                id="cosmeticConsultReason"
                value={settings.cosmeticConsultReason}
                disabled={!canEdit}
                onChange={(e) => setSettings((s) => ({ ...s, cosmeticConsultReason: e.target.value }))}
                placeholder="cosmetic consultation"
              />
              <p className="mt-1 text-caption text-(--color-text-tertiary)">
                Dentally appointment reason text used when importing consults (case-insensitive contains match).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversion thresholds</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="depositThresholdPence">Deposit threshold (pence)</Label>
              <Input
                id="depositThresholdPence"
                type="number"
                min={1}
                disabled={!canEdit}
                value={settings.depositThresholdPence}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, depositThresholdPence: Number(e.target.value) || 5000 }))
                }
              />
              <p className="mt-1 text-caption text-(--color-text-tertiary)">Default 5000 = £50 deposit.</p>
            </div>
            <div>
              <Label htmlFor="paidConversionThresholdPence">Paid conversion threshold (pence)</Label>
              <Input
                id="paidConversionThresholdPence"
                type="number"
                min={1}
                disabled={!canEdit}
                value={settings.paidConversionThresholdPence}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    paidConversionThresholdPence: Number(e.target.value) || 45000,
                  }))
                }
              />
              <p className="mt-1 text-caption text-(--color-text-tertiary)">Default 45000 = £450 paid.</p>
            </div>
          </CardContent>
        </Card>

        {canEdit ? (
          <Button type="submit" loading={saving} data-testid="flow-settings-save">
            Save settings
          </Button>
        ) : (
          <p className="text-body-sm text-(--color-text-tertiary)">Only practice owners can edit Flow settings.</p>
        )}
      </form>
    </PageContent>
  );
}
