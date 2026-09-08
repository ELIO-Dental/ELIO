import { PlansSection } from "@/components/plans-page-chrome";
import {
  activityDetailLabel,
  formatDashboardAction,
  type DashboardActivityEntry,
} from "@/lib/dashboard-stats";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** Recent audit activity on the dashboard (P3.2). */
export function DashboardActivityFeed({ entries }: { entries: DashboardActivityEntry[] }) {
  return (
    <PlansSection title="Recent activity" subtitle="Latest Plans actions">
      {entries.length === 0 ? (
        <p className="py-6 text-center text-body-sm text-(--color-text-tertiary)">No recent activity</p>
      ) : (
        <ul>
          {entries.map((entry) => {
            const label = activityDetailLabel(entry);
            return (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-4 border-b border-(--color-border-subtle) py-3 first:pt-0 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-(--color-text-primary)">
                    {formatDashboardAction(entry.action)}
                  </p>
                  <p className="mt-0.5 truncate text-caption text-(--color-text-tertiary)">
                    {label ? `${label} · ` : ""}
                    {entry.actorLabel}
                  </p>
                </div>
                <p className="shrink-0 text-caption tabular-nums text-(--color-text-tertiary)">
                  {formatWhen(entry.createdAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </PlansSection>
  );
}
