"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, Switch, Label, Input, Button, toast } from "@elio/ui";
import type { ModuleId } from "@elio/db";

interface Props {
  practiceId: string;
  currentPlan: string | null;
  suspended: boolean;
  licences: { moduleId: ModuleId; active: boolean }[];
  featureFlags: { id: string; key: string; name: string; enabled: boolean }[];
}

/**
 * THEME_GUIDELINE.md §6.6's optimistic-update pattern: the toggle flips
 * immediately, shows `pending` (spinner) while the request is in flight, and
 * rolls back with a toast if it fails — the founder should never wonder
 * whether a click here actually registered (§2.2's Testing checklist point,
 * reused here for the same class of control).
 */
export function TenantActions({ practiceId, currentPlan, suspended, licences, featureFlags }: Props) {
  const router = useRouter();
  const [licenceState, setLicenceState] = React.useState(licences);
  const [flagState, setFlagState] = React.useState(featureFlags);
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [plan, setPlan] = React.useState(currentPlan ?? "");
  const [suspendedState, setSuspendedState] = React.useState(suspended);
  const [savingPlan, setSavingPlan] = React.useState(false);
  const [togglingSuspend, setTogglingSuspend] = React.useState(false);

  async function onToggleLicence(moduleId: ModuleId, next: boolean) {
    const key = `licence-${moduleId}`;
    setPendingKey(key);
    setLicenceState((prev) => prev.map((l) => (l.moduleId === moduleId ? { ...l, active: next } : l)));
    const res = await fetch(`/api/tenants/${practiceId}/licence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleId, active: next }),
    });
    setPendingKey(null);
    if (!res.ok) {
      setLicenceState((prev) => prev.map((l) => (l.moduleId === moduleId ? { ...l, active: !next } : l)));
      toast.error(`Failed to update ${moduleId} licence.`);
      return;
    }
    router.refresh();
  }

  async function onToggleFlag(featureFlagId: string, next: boolean) {
    const key = `flag-${featureFlagId}`;
    setPendingKey(key);
    setFlagState((prev) => prev.map((f) => (f.id === featureFlagId ? { ...f, enabled: next } : f)));
    const res = await fetch(`/api/tenants/${practiceId}/feature-flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featureFlagId, enabled: next }),
    });
    setPendingKey(null);
    if (!res.ok) {
      setFlagState((prev) => prev.map((f) => (f.id === featureFlagId ? { ...f, enabled: !next } : f)));
      toast.error("Failed to update feature flag.");
      return;
    }
    router.refresh();
  }

  async function onSavePlan() {
    setSavingPlan(true);
    const res = await fetch(`/api/tenants/${practiceId}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    setSavingPlan(false);
    if (!res.ok) {
      toast.error("Failed to update plan label.");
      return;
    }
    toast.success("Plan updated.");
    router.refresh();
  }

  async function onToggleSuspend() {
    const next = !suspendedState;
    setTogglingSuspend(true);
    setSuspendedState(next);
    const res = await fetch(`/api/tenants/${practiceId}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: next }),
    });
    setTogglingSuspend(false);
    if (!res.ok) {
      setSuspendedState(!next);
      toast.error("Failed to update suspension.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="shadow-(--shadow-sm)">
        <CardHeader>
          <CardTitle>Module licences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {licenceState.map((l) => (
            <div key={l.moduleId} className="flex items-center justify-between">
              <Label htmlFor={`licence-${l.moduleId}`}>{l.moduleId}</Label>
              <Switch
                id={`licence-${l.moduleId}`}
                checked={l.active}
                pending={pendingKey === `licence-${l.moduleId}`}
                onCheckedChange={(checked) => onToggleLicence(l.moduleId, checked)}
                data-testid={`licence-toggle-${l.moduleId}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-(--shadow-sm)">
        <CardHeader>
          <CardTitle>Plan &amp; status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="plan">Plan label</Label>
            <div className="flex gap-2">
              <Input id="plan" value={plan} onChange={(e) => setPlan(e.target.value)} data-testid="plan-input" />
              <Button size="sm" onClick={onSavePlan} loading={savingPlan} data-testid="plan-save">
                Save
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-(--color-border-subtle) pt-4">
            <Label htmlFor="suspend">{suspendedState ? "Suspended" : "Active"}</Label>
            <Button variant={suspendedState ? "primary" : "destructive"} size="sm" onClick={onToggleSuspend} loading={togglingSuspend} data-testid="suspend-toggle">
              {suspendedState ? "Reactivate" : "Suspend"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-(--shadow-sm) md:col-span-2">
        <CardHeader>
          <CardTitle>Feature flags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {flagState.length === 0 && <p className="text-body-sm text-(--color-text-secondary)">No feature flags defined yet.</p>}
          {flagState.map((f) => (
            <div key={f.id} className="flex items-center justify-between">
              <Label htmlFor={`flag-${f.id}`}>
                {f.name} <span className="text-(--color-text-tertiary)">({f.key})</span>
              </Label>
              <Switch
                id={`flag-${f.id}`}
                checked={f.enabled}
                pending={pendingKey === `flag-${f.id}`}
                onCheckedChange={(checked) => onToggleFlag(f.id, checked)}
                data-testid={`flag-toggle-${f.key}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
