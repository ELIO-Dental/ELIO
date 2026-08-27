"use client";

import * as React from "react";
import { Switch } from "@elio/ui";

export function RedeemRuleToggle({ redeemRuleId, initialRequiresApproval }: { redeemRuleId: string; initialRequiresApproval: boolean }) {
  const [checked, setChecked] = React.useState(initialRequiresApproval);
  const [pending, setPending] = React.useState(false);

  async function toggle(next: boolean) {
    setPending(true);
    const prev = checked;
    setChecked(next);
    const res = await fetch("/plans/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redeemRuleId, requiresApproval: next }),
    });
    if (!res.ok) setChecked(prev); // roll back on failure
    setPending(false);
  }

  return <Switch checked={checked} pending={pending} onCheckedChange={toggle} />;
}
