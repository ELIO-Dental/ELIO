import type { ReactNode } from "react";
import { cn } from "@elio/ui";

/** Shared modern section surface for Plans pages. */
export function PlansSection({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-(--radius-xl) border border-(--color-border-subtle) bg-(--color-surface) shadow-(--shadow-xs)",
        className
      )}
    >
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-(--color-border-subtle) bg-(--color-bg-subtle)/40 px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-body-sm font-semibold text-(--color-text-primary)">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-caption text-(--color-text-tertiary)">{subtitle}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className={title ? "p-4 sm:p-5" : "p-4 sm:p-6"}>{children}</div>
    </section>
  );
}

/** Compact metric tile used on Payments / Redeems summary rows. */
export function PlansMetricTile({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "bg-(--color-success)/10 text-(--color-success)"
      : tone === "warning"
        ? "bg-(--color-warning)/10 text-(--color-warning)"
        : tone === "danger"
          ? "bg-(--color-danger)/10 text-(--color-danger)"
          : "bg-(--color-primary-50) text-(--color-primary-600)";

  return (
    <div className="flex items-center gap-3.5 rounded-(--radius-xl) border border-(--color-border-subtle) bg-(--color-surface) px-4 py-3.5 shadow-(--shadow-xs)">
      {icon ? (
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-(--radius-md)", toneClass)}>
          {icon}
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="text-h3 font-semibold tabular-nums tracking-tight text-(--color-text-primary)">{value}</p>
        <p className="text-caption font-medium text-(--color-text-tertiary)">{label}</p>
      </div>
    </div>
  );
}
