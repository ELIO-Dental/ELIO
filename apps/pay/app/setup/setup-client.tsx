"use client";

import * as React from "react";
import { SetupImportPanel } from "./setup-import-panel";

export function SetupClient({
  counts,
}: {
  counts: { labs: number; suppliers: number; dentists: number };
}) {
  const [tab, setTab] = React.useState<"labs" | "suppliers" | "dentists" | "settings">("labs");

  const tabs = [
    { id: "labs" as const, label: "Labs", count: counts.labs },
    { id: "suppliers" as const, label: "Suppliers", count: counts.suppliers },
    { id: "dentists" as const, label: "Dentists", count: counts.dentists },
    { id: "settings" as const, label: "Settings", count: undefined },
  ];

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap gap-1 rounded-lg bg-(--color-surface-muted) p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === t.id ? "bg-white shadow-sm" : "text-(--color-text-secondary)"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-1.5 rounded-full bg-(--color-surface-muted) px-1.5 text-xs">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <SetupImportPanel type={tab} count={tab === "settings" ? undefined : counts[tab]} />

      <p className="text-body-sm text-(--color-text-secondary)">
        Tip: export from AuraPay or Excel, edit offline, then import here once. Use Settings for rates and Dentally IDs.
      </p>
    </div>
  );
}
