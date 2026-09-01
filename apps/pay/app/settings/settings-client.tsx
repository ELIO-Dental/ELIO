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
} from "@elio/ui";
import { Loader2, Save } from "lucide-react";
import { type PaySettings, syncTherapyRates } from "@/lib/pay-settings";

function SettingsField({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-body-sm text-(--color-text-secondary)">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} className="mt-1" />
    </div>
  );
}

export function SettingsClient({ initialSettings }: { initialSettings: PaySettings }) {
  const router = useRouter();
  const [settings, setSettings] = React.useState<PaySettings>(initialSettings);
  const [saving, setSaving] = React.useState(false);
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
        setMessage({ type: "error", text: data?.error ?? "Could not save settings." });
        return;
      }
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      setMessage({ type: "success", text: "Settings saved." });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Could not save settings." });
    } finally {
      setSaving(false);
    }
  }

  const therapyExamples = [15, 30, 45, 60].map((mins) => {
    const rate = parseFloat(settings.therapy_rate || "0.5833");
    return { mins, cost: (rate * mins).toFixed(2) };
  });

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-(--color-text-secondary)">
          Configure rates, Dentally integration, and email for payslips.
        </p>
        <Button onClick={() => void handleSave()} loading={saving} data-testid="settings-save">
          <Save className="mr-2 h-4 w-4" />
          Save all settings
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
        <CardHeader><CardTitle>Clinic branding</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SettingsField label="Clinic name" value={settings.clinic_name} onChange={(v) => update("clinic_name", v)} className="sm:col-span-2" />
          <SettingsField label="Logo URL" value={settings.clinic_logo_url} onChange={(v) => update("clinic_logo_url", v)} className="sm:col-span-2" placeholder="https:// or local://..." />
          <SettingsField label="Address line 1" value={settings.clinic_address_line1} onChange={(v) => update("clinic_address_line1", v)} />
          <SettingsField label="Address line 2" value={settings.clinic_address_line2} onChange={(v) => update("clinic_address_line2", v)} />
          <SettingsField label="City" value={settings.clinic_city} onChange={(v) => update("clinic_city", v)} />
          <SettingsField label="Postcode" value={settings.clinic_postcode} onChange={(v) => update("clinic_postcode", v)} />
          <SettingsField label="Phone" value={settings.clinic_phone} onChange={(v) => update("clinic_phone", v)} />
          <SettingsField label="Email" value={settings.clinic_email} onChange={(v) => update("clinic_email", v)} />
          <SettingsField label="Website" value={settings.clinic_website} onChange={(v) => update("clinic_website", v)} className="sm:col-span-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Therapy calculator</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsField label="Hourly rate (£)" value={settings.therapy_hourly_rate} onChange={updateTherapyHourly} type="number" />
            <SettingsField label="Per minute rate (£)" value={settings.therapy_rate} onChange={updateTherapyPerMin} type="number" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {therapyExamples.map(({ mins, cost }) => (
              <div key={mins} className="rounded-lg border border-(--color-border) px-3 py-2 text-center">
                <div className="text-body-sm text-(--color-text-secondary)">{mins} mins</div>
                <div className="font-semibold">£{cost}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Calculation rates</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsField label="Lab bill split (dentist fraction)" value={settings.lab_bill_split} onChange={(v) => update("lab_bill_split", v)} type="number" />
            <SettingsField label="Finance fee split (dentist fraction)" value={settings.finance_fee_split} onChange={(v) => update("finance_fee_split", v)} type="number" />
          </div>
          <p className="text-body-sm font-medium">Tabeo finance rates (by term)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SettingsField label="3 months" value={settings.finance_rate_3m} onChange={(v) => update("finance_rate_3m", v)} type="number" />
            <SettingsField label="12 months" value={settings.finance_rate_12m} onChange={(v) => update("finance_rate_12m", v)} type="number" />
            <SettingsField label="36 months" value={settings.finance_rate_36m} onChange={(v) => update("finance_rate_36m", v)} type="number" />
            <SettingsField label="60 months" value={settings.finance_rate_60m} onChange={(v) => update("finance_rate_60m", v)} type="number" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dentally integration</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <SettingsField label="Site ID" value={settings.dentally_site_id} onChange={(v) => update("dentally_site_id", v)} placeholder="Dentally site UUID" />
          <SettingsField
            label="Therapist / hygienist IDs (comma-separated)"
            value={settings.therapist_ids}
            onChange={(v) => update("therapist_ids", v)}
            placeholder="189342,189343"
          />
          <SettingsField
            label="NHS amounts to exclude (comma-separated £)"
            value={settings.nhs_amounts}
            onChange={(v) => update("nhs_amounts", v)}
            placeholder="27.40,75.30,326.70"
          />
          <SettingsField
            label="Cosmetic consultation treatment code"
            value={settings.cosmetic_consultation_treatment_code}
            onChange={(v) => update("cosmetic_consultation_treatment_code", v)}
            placeholder="e.g. COSM01"
            data-testid="cosmetic-code-input"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Email (SMTP)</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SettingsField label="SMTP host" value={settings.smtp_host} onChange={(v) => update("smtp_host", v)} />
          <SettingsField label="SMTP port" value={settings.smtp_port} onChange={(v) => update("smtp_port", v)} />
          <SettingsField label="SMTP username" value={settings.smtp_user} onChange={(v) => update("smtp_user", v)} />
          <SettingsField label="SMTP password" value={settings.smtp_pass} onChange={(v) => update("smtp_pass", v)} type="password" placeholder="Leave blank to keep existing" />
          <SettingsField label="From address" value={settings.email_from} onChange={(v) => update("email_from", v)} className="sm:col-span-2" />
        </CardContent>
      </Card>
    </div>
  );
}
