"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  toast,
} from "@elio/ui";
import { Image as ImageIcon, Save, Upload, X } from "lucide-react";
import { type PaySettings, syncTherapyRates } from "@/lib/pay-settings";

function DentallyApiKeyPanel() {
  const [apiKey, setApiKey] = React.useState("");
  const [status, setStatus] = React.useState<{
    configured: boolean;
    hasPracticeKey: boolean;
    connectionStatus: string;
    connectionOk: boolean | null;
    connectionError: string | null;
  } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const loadStatus = React.useCallback(async (test = false) => {
    const res = await fetch(`/pay/api/dentally/status${test ? "?test=1" : ""}`);
    if (res.ok) setStatus(await res.json());
  }, []);

  React.useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/pay/api/dentally/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save API key");
      setApiKey("");
      setMessage("API key saved. Run a connection test to verify.");
      toast.success("API key saved");
      await loadStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save API key";
      setMessage(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/pay/api/dentally/status?test=1");
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
        const msg = data.connectionOk ? "Connection successful." : data.connectionError ?? "Connection failed.";
        setMessage(msg);
        if (data.connectionOk) toast.success("Connection successful");
        else toast.error(msg);
      } else {
        const msg = data.error ?? "Connection test failed";
        setMessage(msg);
        toast.error(msg);
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-body-sm text-(--color-text-secondary)">
        {status?.hasPracticeKey
          ? "A practice API key is configured (value never shown after save)."
          : status?.configured
            ? "Using environment fallback key — set a practice key for production."
            : "No Dentally API key configured yet."}
      </p>
      <form onSubmit={(e) => void saveKey(e)} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <Label htmlFor="dentally-api-key">New API key</Label>
          <Input
            id="dentally-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste Dentally API key"
            className="mt-1"
          />
        </div>
        <Button type="submit" loading={saving} disabled={!apiKey.trim()}>
          Save key
        </Button>
        <Button type="button" variant="outline" onClick={() => void testConnection()} loading={testing}>
          Test connection
        </Button>
      </form>
      {status?.connectionOk === false && status.connectionError && (
        <p className="text-body-sm text-(--color-danger)">{status.connectionError}</p>
      )}
      {message && <p className="text-body-sm text-(--color-text-secondary)">{message}</p>}
    </div>
  );
}

function SettingsField({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  className,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-body-sm text-(--color-text-secondary)">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        placeholder={placeholder}
        className="mt-1"
      />
      {hint ? <p className="mt-1 text-[10px] text-(--color-text-tertiary)">{hint}</p> : null}
    </div>
  );
}

function splitPercentLabel(fraction: string): string {
  const n = parseFloat(fraction);
  if (!Number.isFinite(n)) return "—";
  return `= ${Math.round(n * 100)}%`;
}

export function SettingsClient({ initialSettings }: { initialSettings: PaySettings }) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [settings, setSettings] = React.useState<PaySettings>(initialSettings);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  function update(key: keyof PaySettings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function updateTherapyHourly(value: string) {
    setSettings((prev) => syncTherapyRates({ ...prev, therapy_hourly_rate: value }, "hourly"));
  }

  function updateTherapyPerMin(value: string) {
    setSettings((prev) => syncTherapyRates({ ...prev, therapy_rate: value }, "per_min"));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/pay/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const text = data?.error ?? "Could not save settings.";
        setMessage({ type: "error", text });
        toast.error(text);
        return;
      }
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      setMessage({ type: "success", text: "Settings saved." });
      toast.success("Settings saved");
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Could not save settings." });
      toast.error("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/pay/api/settings/logo", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        toast.error(typeof data.error === "string" ? data.error : "Logo upload failed");
        return;
      }
      update("clinic_logo_url", data.url);
      toast.success("Logo uploaded");
      router.refresh();
    } catch {
      toast.error("Logo upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removeLogo() {
    update("clinic_logo_url", "");
  }

  const therapyExamples = [15, 30, 45, 60].map((mins) => {
    const rate = parseFloat(settings.therapy_rate || "0.5833");
    return { mins, cost: (rate * mins).toFixed(2) };
  });

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-(--color-text-secondary)">
          Configure rates, branding, Dentally, and email for payslips. Bulk CSV import lives in{" "}
          <Link href="/setup" className="font-medium text-(--color-brand) hover:underline">
            Setup
          </Link>
          .
        </p>
        <Button onClick={() => void handleSave()} loading={saving} data-testid="settings-save">
          <Save className="mr-2 h-4 w-4" />
          Save
        </Button>
      </div>

      {message && (
        <p
          className={`text-body-sm ${message.type === "error" ? "text-(--color-danger)" : "text-(--color-text-secondary)"}`}
          data-testid="settings-message"
        >
          {message.text}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Clinic Branding</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-body-sm text-(--color-text-secondary)">Clinic Logo</Label>
            <div className="mt-2 flex items-center gap-4">
              {settings.clinic_logo_url ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.clinic_logo_url}
                    alt="Clinic logo"
                    className="h-20 w-20 rounded-lg border border-(--color-border-subtle) bg-(--color-surface) object-contain"
                  />
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-(--color-danger) text-white hover:opacity-90"
                    aria-label="Remove logo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-(--color-border-subtle) bg-(--color-bg-subtle)">
                  <ImageIcon className="h-6 w-6 text-(--color-text-tertiary)" />
                </div>
              )}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => void handleLogoUpload(e)}
                />
                <Button
                  type="button"
                  variant="outline"
                  loading={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Logo
                </Button>
                <p className="mt-1 text-[10px] text-(--color-text-tertiary)">PNG, JPG, SVG, or WebP. Max 2MB.</p>
                <p className="mt-0.5 text-[10px] text-(--color-text-tertiary)">
                  Clearing the logo updates the form — click Save to persist.
                </p>
              </div>
            </div>
          </div>
          <SettingsField
            label="Clinic Name"
            value={settings.clinic_name}
            onChange={(v) => update("clinic_name", v)}
            placeholder="Your Dental Clinic"
            className="sm:col-span-2"
          />
          <SettingsField
            label="Address Line 1"
            value={settings.clinic_address_line1}
            onChange={(v) => update("clinic_address_line1", v)}
            placeholder="123 High Street"
          />
          <SettingsField
            label="Address Line 2"
            value={settings.clinic_address_line2}
            onChange={(v) => update("clinic_address_line2", v)}
            placeholder="Suite 100"
          />
          <SettingsField
            label="City"
            value={settings.clinic_city}
            onChange={(v) => update("clinic_city", v)}
            placeholder="London"
          />
          <SettingsField
            label="Postcode"
            value={settings.clinic_postcode}
            onChange={(v) => update("clinic_postcode", v)}
            placeholder="SW1A 1AA"
          />
          <SettingsField
            label="Phone"
            value={settings.clinic_phone}
            onChange={(v) => update("clinic_phone", v)}
            placeholder="+44 20 1234 5678"
          />
          <SettingsField
            label="Email"
            value={settings.clinic_email}
            onChange={(v) => update("clinic_email", v)}
            placeholder="info@clinic.com"
          />
          <SettingsField
            label="Website"
            value={settings.clinic_website}
            onChange={(v) => update("clinic_website", v)}
            placeholder="example.com"
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Therapy Calculator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border border-(--color-primary-100) bg-(--color-primary-50) p-4">
            <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <Label className="text-body-sm text-(--color-text-primary)">Hourly Rate</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-(--color-text-secondary)">
                    £
                  </span>
                  <Input
                    type="number"
                    step="1"
                    value={settings.therapy_hourly_rate}
                    onChange={(e) => updateTherapyHourly(e.target.value)}
                    placeholder="35"
                    className="pl-7 pr-14 font-semibold"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-(--color-text-tertiary)">
                    /hour
                  </span>
                </div>
              </div>
              <div className="hidden pb-2 text-center text-2xl text-(--color-primary-400) sm:block">=</div>
              <div>
                <Label className="text-body-sm text-(--color-text-primary)">Per Minute Rate</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-(--color-text-secondary)">
                    £
                  </span>
                  <Input
                    type="number"
                    step="0.0001"
                    value={settings.therapy_rate}
                    onChange={(e) => updateTherapyPerMin(e.target.value)}
                    className="pl-7 pr-12 font-semibold"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-(--color-text-tertiary)">
                    /min
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 border-t border-(--color-primary-100) pt-3">
              <p className="mb-2 text-xs font-medium text-(--color-text-secondary)">Quick Reference</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {therapyExamples.map(({ mins, cost }) => (
                  <div
                    key={mins}
                    className="rounded-md border border-(--color-primary-100) bg-(--color-surface) px-3 py-2 text-center"
                  >
                    <div className="text-xs text-(--color-text-secondary)">{mins} mins</div>
                    <div className="text-sm font-bold text-(--color-primary-700)">£{cost}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-(--color-text-tertiary)">
            This rate is charged to dentists for therapy/hygienist appointments referred by them. The cost is
            deducted from their payslip.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calculation Rates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-body-sm text-(--color-text-secondary)">Lab Bill Split</Label>
              <div className="relative mt-1">
                <Input
                  type="number"
                  step="0.01"
                  value={settings.lab_bill_split}
                  onChange={(e) => update("lab_bill_split", e.target.value)}
                  className="pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-(--color-text-tertiary)">
                  {splitPercentLabel(settings.lab_bill_split)}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-(--color-text-tertiary)">Dentist pays this fraction</p>
            </div>
            <div>
              <Label className="text-body-sm text-(--color-text-secondary)">Finance Fee Split</Label>
              <div className="relative mt-1">
                <Input
                  type="number"
                  step="0.01"
                  value={settings.finance_fee_split}
                  onChange={(e) => update("finance_fee_split", e.target.value)}
                  className="pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-(--color-text-tertiary)">
                  {splitPercentLabel(settings.finance_fee_split)}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-(--color-text-tertiary)">Dentist pays this fraction</p>
            </div>
          </div>
          <div className="border-t border-(--color-border-subtle) pt-3">
            <p className="mb-2 text-body-sm font-medium text-(--color-text-secondary)">
              Tabeo Finance Rates (by term)
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SettingsField
                label="3 months"
                value={settings.finance_rate_3m}
                onChange={(v) => update("finance_rate_3m", v)}
                type="number"
                placeholder="0.045"
              />
              <SettingsField
                label="12 months"
                value={settings.finance_rate_12m}
                onChange={(v) => update("finance_rate_12m", v)}
                type="number"
                placeholder="0.08"
              />
              <SettingsField
                label="36 months"
                value={settings.finance_rate_36m}
                onChange={(v) => update("finance_rate_36m", v)}
                type="number"
                placeholder="0.034"
              />
              <SettingsField
                label="60 months"
                value={settings.finance_rate_60m}
                onChange={(v) => update("finance_rate_60m", v)}
                type="number"
                placeholder="0.037"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dentally API Key</CardTitle>
        </CardHeader>
        <CardContent>
          <DentallyApiKeyPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dentally Integration</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SettingsField
            label="Site ID"
            value={settings.dentally_site_id}
            onChange={(v) => update("dentally_site_id", v)}
            placeholder="Your Dentally Site ID (UUID)"
          />
          <SettingsField
            label="Therapist / Hygienist IDs (comma-separated)"
            value={settings.therapist_ids}
            onChange={(v) => update("therapist_ids", v)}
            placeholder="e.g. 189342,189343,189349"
            hint="Practitioner IDs from Dentally for therapists/hygienists. Their invoices are excluded from dentist earnings."
          />
          <SettingsField
            label="NHS Amounts to Exclude (comma-separated £)"
            value={settings.nhs_amounts}
            onChange={(v) => update("nhs_amounts", v)}
            placeholder="e.g. 27.40,75.30,326.70"
            hint="NHS Band charge amounts to exclude (leave empty to rely on keyword detection only)."
          />
          <SettingsField
            label="Excluded Treatments (comma-separated phrases)"
            value={settings.excluded_treatments}
            onChange={(v) => update("excluded_treatments", v)}
            placeholder="CBCT, CT Scan, Cone Beam"
          />
          <SettingsField
            label="Cosmetic Consultation Treatment Code"
            value={settings.cosmetic_consultation_treatment_code}
            onChange={(v) => update("cosmetic_consultation_treatment_code", v)}
            placeholder="e.g. COSM01"
          />
          <SettingsField
            label="Private Takings Google Sheet IDs (JSON map)"
            value={settings.takings_spreadsheet_ids}
            onChange={(v) => update("takings_spreadsheet_ids", v)}
            placeholder='{"Dentist Name":"spreadsheetId"}'
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email (SMTP)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SettingsField
            label="SMTP Host"
            value={settings.smtp_host}
            onChange={(v) => update("smtp_host", v)}
            placeholder="smtp.gmail.com"
          />
          <SettingsField
            label="SMTP Port"
            value={settings.smtp_port}
            onChange={(v) => update("smtp_port", v)}
            placeholder="587"
          />
          <SettingsField
            label="SMTP Username"
            value={settings.smtp_user}
            onChange={(v) => update("smtp_user", v)}
            placeholder="you@gmail.com"
          />
          <SettingsField
            label="SMTP Password"
            value={settings.smtp_pass}
            onChange={(v) => update("smtp_pass", v)}
            type="password"
            placeholder="Leave blank to keep existing"
          />
          <SettingsField
            label="From Address"
            value={settings.email_from}
            onChange={(v) => update("email_from", v)}
            placeholder="payslips@example.com"
            className="sm:col-span-2"
          />
          <p className="text-xs text-(--color-text-tertiary) sm:col-span-2">
            For Gmail, use an App Password (not your regular password). Enable 2FA first, then generate at
            myaccount.google.com.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
