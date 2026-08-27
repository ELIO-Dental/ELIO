"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@elio/ui";

export function SettingsClient({ initialCode }: { initialCode: string | null }) {
  const [code, setCode] = React.useState(initialCode ?? "");
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/pay/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cosmeticConsultationTreatmentCode: code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMessage({ type: "error", text: data?.error ?? "Could not save settings." });
        return;
      }
      setMessage({ type: "success", text: "Settings saved." });
    } catch {
      setMessage({ type: "error", text: "Could not save settings." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cosmetic consultation</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="flex flex-wrap items-end gap-3" data-testid="settings-form">
            <div className="min-w-[220px] flex-1">
              <Label htmlFor="cosmetic-code">Cosmetic consultation treatment code</Label>
              <Input
                id="cosmetic-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. COSM01"
                data-testid="cosmetic-code-input"
              />
            </div>
            <Button type="submit" loading={saving} data-testid="settings-save">
              Save
            </Button>
          </form>
          {message && (
            <p
              className={`mt-2 text-body-sm ${message.type === "error" ? "text-(--color-danger)" : "text-(--color-text-secondary)"}`}
              data-testid="settings-message"
            >
              {message.text}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
