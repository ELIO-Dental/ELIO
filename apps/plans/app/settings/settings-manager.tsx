"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, Palette, Save } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@elio/ui";
import { SettingKeys } from "@/lib/plans-settings";

export type BrandingState = {
  brandName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  emailSenderName: string;
  customDomain: string;
};

type GcEnvStatus = {
  hasToken: boolean;
  tokenPrefix: string;
  environment: string;
  hasWebhookSecret: boolean;
  mockFallbackEnabled: boolean;
};

type SettingsTab = "branding" | "practice" | "gocardless" | "membership" | "payments" | "payouts";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "branding", label: "Branding" },
  { id: "practice", label: "Practice" },
  { id: "gocardless", label: "GoCardless" },
  { id: "membership", label: "Membership" },
  { id: "payments", label: "Payment Rules" },
  { id: "payouts", label: "Payouts" },
];

function dayOptions() {
  return Array.from({ length: 28 }, (_, i) => {
    const n = i + 1;
    const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
    return { value: String(n), label: `${n}${suffix} of month` };
  });
}

/** Six-tab settings UI (P4.4 legacy parity). */
export function SettingsManager({
  initialSettings,
  initialBranding,
  gocardless,
  canEdit,
}: {
  initialSettings: Record<string, string>;
  initialBranding: BrandingState;
  gocardless: GcEnvStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<SettingsTab>("branding");
  const [settings, setSettings] = React.useState(initialSettings);
  const [branding, setBranding] = React.useState(initialBranding);
  const [saving, setSaving] = React.useState(false);
  const [testingGc, setTestingGc] = React.useState(false);
  const [gcStatus, setGcStatus] = React.useState<Record<string, unknown> | null>(null);
  const [uploading, setUploading] = React.useState<"logoUrl" | "faviconUrl" | null>(null);
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const faviconInputRef = React.useRef<HTMLInputElement>(null);

  function updateSetting(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function updateBrandingField<K extends keyof BrandingState>(key: K, value: BrandingState[K]) {
    setBranding((prev) => ({ ...prev, [key]: value }));
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch("/plans/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save settings");
        return;
      }
      if (data.settings) setSettings(data.settings);
      toast.success("Settings saved");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveBranding() {
    setSaving(true);
    try {
      const res = await fetch("/plans/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branding }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save branding");
        return;
      }
      if (data.settings) setSettings(data.settings);
      if (data.branding) setBranding(data.branding);
      toast.success("Branding saved");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(file: File, field: "logoUrl" | "faviconUrl") {
    setUploading(field);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/plans/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Upload failed");
        return;
      }
      updateBrandingField(field, data.url as string);
      const updated = { ...branding, [field]: data.url as string };
      setBranding(updated);
      const saveRes = await fetch("/plans/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branding: updated }),
      });
      if (saveRes.ok) {
        toast.success(`${field === "logoUrl" ? "Logo" : "Favicon"} uploaded and saved`);
        router.refresh();
      } else {
        toast.success("Image uploaded — click Save branding to persist");
      }
    } finally {
      setUploading(null);
    }
  }

  async function testGcConnection() {
    setTestingGc(true);
    setGcStatus(null);
    try {
      const res = await fetch("/plans/api/settings/check-gc");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Connection test failed");
        return;
      }
      setGcStatus(data);
    } finally {
      setTestingGc(false);
    }
  }

  const saveButton =
    tab === "branding" ? (
      <Button size="sm" onClick={() => void saveBranding()} loading={saving} disabled={!canEdit}>
        <Save className="mr-2 size-4" />
        Save branding
      </Button>
    ) : (
      <Button size="sm" onClick={() => void saveSettings()} loading={saving} disabled={!canEdit}>
        <Save className="mr-2 size-4" />
        Save changes
      </Button>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}>
              <Badge variant={tab === t.id ? "primary" : "neutral"}>{t.label}</Badge>
            </button>
          ))}
        </div>
        {canEdit && saveButton}
      </div>

      {tab === "branding" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-5" />
              White-label branding
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="brandName">Brand name</Label>
                <Input
                  id="brandName"
                  value={branding.brandName}
                  onChange={(e) => updateBrandingField("brandName", e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label htmlFor="tagline">Tagline</Label>
                <Input
                  id="tagline"
                  value={branding.tagline}
                  onChange={(e) => updateBrandingField("tagline", e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["logoUrl", "Logo", logoInputRef, "image/png,image/jpeg,image/svg+xml,image/webp"],
                  ["faviconUrl", "Favicon", faviconInputRef, "image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/webp"],
                ] as const
              ).map(([field, label, inputRef, accept]) => (
                <div key={field}>
                  <Label>{label}</Label>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    className="hidden"
                    disabled={!canEdit}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileUpload(file, field);
                      e.target.value = "";
                    }}
                  />
                  {branding[field] ? (
                    <div className="mt-1 rounded-(--radius-lg) border border-(--color-border) p-3">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!canEdit || uploading === field}
                          loading={uploading === field}
                          onClick={() => inputRef.current?.click()}
                        >
                          Replace
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!canEdit}
                          onClick={() => updateBrandingField(field, "")}
                        >
                          Remove
                        </Button>
                      </div>
                      <div className="flex items-center justify-center rounded border border-(--color-border-subtle) bg-(--color-surface) p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={branding[field]}
                          alt={`${label} preview`}
                          className={field === "logoUrl" ? "h-12 max-w-full object-contain" : "size-8 object-contain"}
                        />
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canEdit || uploading === field}
                      onClick={() => inputRef.current?.click()}
                      className="mt-1 flex w-full flex-col items-center gap-2 rounded-(--radius-lg) border-2 border-dashed border-(--color-border) p-6 text-body-sm text-(--color-text-tertiary) hover:border-(--color-border-subtle) disabled:opacity-50"
                    >
                      {uploading === field ? "Uploading…" : `Upload ${label.toLowerCase()}`}
                      <span className="text-caption">Max 512KB</span>
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["primaryColor", "Primary color"],
                  ["secondaryColor", "Secondary color"],
                  ["accentColor", "Accent color"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label htmlFor={key}>{label}</Label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="color"
                      id={key}
                      value={branding[key]}
                      onChange={(e) => updateBrandingField(key, e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded border border-(--color-border)"
                      disabled={!canEdit}
                    />
                    <Input
                      value={branding[key]}
                      onChange={(e) => updateBrandingField(key, e.target.value)}
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="mb-3 flex items-center gap-2 text-body-sm font-semibold text-(--color-text-primary)">
                <Eye className="size-4" />
                Live preview
              </h3>
              <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border)">
                <div className="flex items-center gap-3 p-4" style={{ backgroundColor: branding.primaryColor }}>
                  {branding.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={branding.logoUrl} alt="Logo" className="h-8" />
                  ) : (
                    <span className="text-body font-bold text-white">{branding.brandName}</span>
                  )}
                  <span className="text-caption text-white/80">{branding.tagline}</span>
                </div>
                <div className="flex gap-3 bg-(--color-surface) p-4">
                  <span className="rounded-(--radius-md) px-4 py-2 text-body-sm font-medium text-white" style={{ backgroundColor: branding.secondaryColor }}>
                    Primary
                  </span>
                  <span className="rounded-(--radius-md) px-4 py-2 text-body-sm font-medium text-white" style={{ backgroundColor: branding.accentColor }}>
                    Accent
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="emailSenderName">Email sender name</Label>
                <Input
                  id="emailSenderName"
                  value={branding.emailSenderName}
                  onChange={(e) => updateBrandingField("emailSenderName", e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label htmlFor="customDomain">Custom domain</Label>
                <Input
                  id="customDomain"
                  value={branding.customDomain}
                  onChange={(e) => updateBrandingField("customDomain", e.target.value)}
                  placeholder="plans.example.com"
                  disabled={!canEdit}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "practice" && (
        <Card>
          <CardHeader>
            <CardTitle>Practice information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="practiceName">Practice name</Label>
                <Input
                  id="practiceName"
                  value={settings[SettingKeys.PRACTICE_NAME] ?? ""}
                  onChange={(e) => updateSetting(SettingKeys.PRACTICE_NAME, e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Select
                  value={settings[SettingKeys.PRACTICE_CURRENCY] ?? "GBP"}
                  onValueChange={(v) => updateSetting(SettingKeys.PRACTICE_CURRENCY, v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="supportEmail">Support email</Label>
                <Input
                  id="supportEmail"
                  type="email"
                  value={settings[SettingKeys.PRACTICE_SUPPORT_EMAIL] ?? ""}
                  onChange={(e) => updateSetting(SettingKeys.PRACTICE_SUPPORT_EMAIL, e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <Label htmlFor="supportPhone">Support phone</Label>
                <Input
                  id="supportPhone"
                  value={settings[SettingKeys.PRACTICE_SUPPORT_PHONE] ?? ""}
                  onChange={(e) => updateSetting(SettingKeys.PRACTICE_SUPPORT_PHONE, e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={settings[SettingKeys.PRACTICE_VAT_ENABLED] === "true"}
                onChange={(e) => updateSetting(SettingKeys.PRACTICE_VAT_ENABLED, e.target.checked ? "true" : "false")}
                disabled={!canEdit}
              />
              Enable VAT display in reports
            </label>
          </CardContent>
        </Card>
      )}

      {tab === "gocardless" && (
        <Card>
          <CardHeader>
            <CardTitle>GoCardless configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 rounded-(--radius-lg) border border-amber-200 bg-amber-50 p-4 text-body-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertCircle className="size-5 shrink-0" />
              <p>
                Access token, environment and webhook secret are set via deployment environment variables. Only
                collection/retry days and creditor ID are stored in the app.
              </p>
            </div>

            <div className="space-y-3 rounded-(--radius-lg) border border-(--color-border) p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-body-sm font-medium text-(--color-text-primary)">Connection status</p>
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={() => void testGcConnection()} loading={testingGc}>
                    Test connection
                  </Button>
                )}
              </div>
              <div className="text-body-sm text-(--color-text-secondary)">
                <p>Token: {gocardless.hasToken ? gocardless.tokenPrefix : "Not configured"}</p>
                <p>Environment: {gocardless.environment}</p>
                <p>Webhook secret: {gocardless.hasWebhookSecret ? "Configured" : "Missing"}</p>
                {gocardless.mockFallbackEnabled && <p className="text-amber-600">Mock fallback enabled</p>}
              </div>
              {gcStatus && (
                <div className="border-t border-(--color-border) pt-3 text-body-sm text-(--color-text-secondary)">
                  <p>
                    API connectivity:{" "}
                    {gcStatus.apiConnected === true ? (
                      <span className="text-green-600">Connected</span>
                    ) : gcStatus.apiConnected === false ? (
                      <span className="text-red-600">Failed{gcStatus.apiError ? ` — ${String(gcStatus.apiError)}` : ""}</span>
                    ) : (
                      <span>Not tested</span>
                    )}
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Environment (read-only)</Label>
                <Input value={settings[SettingKeys.GOCARDLESS_ENVIRONMENT] ?? "sandbox"} disabled />
              </div>
              <div>
                <Label htmlFor="creditorId">Creditor ID (optional)</Label>
                <Input
                  id="creditorId"
                  value={settings[SettingKeys.GOCARDLESS_CREDITOR_ID] ?? ""}
                  onChange={(e) => updateSetting(SettingKeys.GOCARDLESS_CREDITOR_ID, e.target.value)}
                  placeholder="CR..."
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Collection day</Label>
                <Select
                  value={settings[SettingKeys.GOCARDLESS_COLLECTION_DAY] ?? "1"}
                  onValueChange={(v) => updateSetting(SettingKeys.GOCARDLESS_COLLECTION_DAY, v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dayOptions().map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Retry day (if failed)</Label>
                <Select
                  value={settings[SettingKeys.GOCARDLESS_RETRY_DAY] ?? "11"}
                  onValueChange={(v) => updateSetting(SettingKeys.GOCARDLESS_RETRY_DAY, v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dayOptions().map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "membership" && (
        <Card>
          <CardHeader>
            <CardTitle>Membership rules</CardTitle>
          </CardHeader>
          <CardContent>
            <Label>Minimum term (months)</Label>
            <Select
              value={settings[SettingKeys.MEMBERSHIP_MIN_TERM_MONTHS] ?? "12"}
              onValueChange={(v) => updateSetting(SettingKeys.MEMBERSHIP_MIN_TERM_MONTHS, v)}
              disabled={!canEdit}
            >
              <SelectTrigger className="mt-1 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["6", "12", "18", "24"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v} months
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-caption text-(--color-text-tertiary)">Patients must commit to this minimum term</p>
          </CardContent>
        </Card>
      )}

      {tab === "payments" && (
        <Card>
          <CardHeader>
            <CardTitle>Payment failure rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Max payment retries</Label>
                <Select
                  value={settings[SettingKeys.PAYMENT_MAX_RETRIES] ?? "3"}
                  onValueChange={(v) => updateSetting(SettingKeys.PAYMENT_MAX_RETRIES, v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3", "5"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v} {v === "1" ? "retry" : "retries"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Grace period (days)</Label>
                <Select
                  value={settings[SettingKeys.PAYMENT_GRACE_PERIOD_DAYS] ?? "14"}
                  onValueChange={(v) => updateSetting(SettingKeys.PAYMENT_GRACE_PERIOD_DAYS, v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["7", "14", "21", "30"].map((v) => (
                      <SelectItem key={v} value={v}>
                        {v} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={settings[SettingKeys.PAYMENT_AUTO_SUSPEND_REDEEMS] === "true"}
                onChange={(e) =>
                  updateSetting(SettingKeys.PAYMENT_AUTO_SUSPEND_REDEEMS, e.target.checked ? "true" : "false")
                }
                disabled={!canEdit}
              />
              Automatically suspend redeems when payment fails
            </label>
          </CardContent>
        </Card>
      )}

      {tab === "payouts" && (
        <Card>
          <CardHeader>
            <CardTitle>Dentist payouts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 rounded-(--radius-lg) border border-blue-200 bg-blue-50 p-4 text-body-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
              <AlertCircle className="size-5 shrink-0" />
              <p>Internal only — patients never see payout amounts. Used in revenue reports.</p>
            </div>
            <div>
              <Label htmlFor="payoutPerExam">Dentist payout per plan exam (£)</Label>
              <Input
                id="payoutPerExam"
                type="number"
                step="0.01"
                className="mt-1 w-48"
                value={settings[SettingKeys.DENTIST_PAYOUT_PER_EXAM] ?? "25.00"}
                onChange={(e) => updateSetting(SettingKeys.DENTIST_PAYOUT_PER_EXAM, e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <p className="text-body-sm text-(--color-text-secondary)">
              Total dentist payout = plan exams × £{settings[SettingKeys.DENTIST_PAYOUT_PER_EXAM] ?? "25.00"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
