"use client";

import * as React from "react";
import { Switch } from "@elio/ui";

export function RedeemRuleToggle({ redeemRuleId, initialRequiresApproval }: { redeemRuleId: string; initialRequiresApproval: boolean }) {
  const [checked, setChecked] = React.useState(initialRequiresApproval);
  const [pending, setPending] = React.useState(false);

  async function toggle(next: boolean) {
    // Re-entrancy guard — Switch's `pending` prop deliberately keeps the
    // track looking interactive (not disabled/greyed) while a request is
    // in flight, per this component's own design intent, so nothing at
    // the control level stops a second click mid-request. Without this
    // guard a rapid second toggle could overlap with the first request,
    // and whichever response landed last (not necessarily the last click)
    // would win — a real source of the switch's state "fluctuating"
    // (found in a 2026-09-12 UI-stability review).
    if (pending) return;
    setPending(true);
    const prev = checked;
    setChecked(next);
    try {
      const res = await fetch("/plans/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redeemRuleId, requiresApproval: next }),
      });
      if (!res.ok) setChecked(prev); // roll back on failure
    } catch {
      setChecked(prev); // network error — roll back too, same as a non-ok response
    } finally {
      setPending(false);
    }
  }

  return <Switch checked={checked} pending={pending} onCheckedChange={toggle} />;
}
