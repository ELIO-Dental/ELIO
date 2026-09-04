"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [settings, setSettings] = React.useState(initialSettings);
  const [saving, setSaving] = React.useState(false);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  async function uploadLogo(file: File) {
    if (!canEdit) return;
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/flow/api/upload", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setSettings((s) => ({ ...s, logoUrl: body.url }));
      toast.success("Logo uploaded — save settings to apply in the sidebar");
    } catch (err) {
      toast.error("Logo upload failed", {
        description: err instanceof Error ? err.message : "Use PNG, JPG, or SVG under 1MB.",
      });
    } finally {
      setUploadingLogo(false);
    }
  }

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
          appDisplayName: settings.appDisplayName,
          logoUrl: settings.logoUrl,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to save settings");
      setSettings(body.settings);
      toast.success("Settings saved");
      router.refresh();
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
        description="Configure Flow pipeline rules — branding, plan name, cosmetic consult import filter, and conversion thresholds."
      />

      <form className="mt-8 space-y-6" onSubmit={save} data-testid="flow-settings-form">
        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Logo</Label>
              <div className="mt-2 flex items-start gap-4">
                <div
                  className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-md) border border-dashed border-(--color-border) bg-(--color-bg-subtle)"
                  data-testid="flow-logo-preview"
                >
                  {settings.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={settings.logoUrl} alt="Practice logo" className="size-full object-contain p-2" />
                  ) : (
                    <span className="text-caption text-(--color-text-tertiary)">No logo</span>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadLogo(file);
                      e.target.value = "";
                    }}
                  />
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        loading={uploadingLogo}
                        onClick={() => logoInputRef.current?.click()}
                        data-testid="flow-logo-upload"
                      >
                        Upload logo
                      </Button>
                      {settings.logoUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setSettings((s) => ({ ...s, logoUrl: "" }))}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-caption text-(--color-text-tertiary)">
                    PNG, JPG, or SVG. Max 1MB. Also used as the browser favicon after save.
                  </p>
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="appDisplayName">App display name</Label>
              <Input
                id="appDisplayName"
                value={settings.appDisplayName}
                disabled={!canEdit}
                onChange={(e) => setSettings((s) => ({ ...s, appDisplayName: e.target.value }))}
                placeholder="Leave blank to use practice name"
              />
              <p className="mt-1 text-caption text-(--color-text-tertiary)">
                Shown in the Flow sidebar header (legacy ElioFlow app name).
              </p>
            </div>
            <div>
              <Label htmlFor="logoUrl">Or enter logo URL</Label>
              <Input
                id="logoUrl"
                value={settings.logoUrl.startsWith("data:") ? "" : settings.logoUrl}
                disabled={!canEdit}
                onChange={(e) => setSettings((s) => ({ ...s, logoUrl: e.target.value }))}
                placeholder="https://example.com/logo.png"
              />
            </div>
          </CardContent>
        </Card>

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
