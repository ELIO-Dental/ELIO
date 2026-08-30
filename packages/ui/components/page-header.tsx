import * as React from "react";
import { cn } from "../lib/cn";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 border-b border-(--color-border-subtle) pb-6 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-h1 text-(--color-text-primary)">{title}</h1>
        {description && <div className="mt-2 text-body leading-relaxed text-(--color-text-secondary)">{description}</div>}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

const WIDTH = {
  sm: "max-w-3xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-full",
} as const;

export function PageContent({
  children,
  className,
  width = "lg",
}: {
  children: React.ReactNode;
  className?: string;
  width?: keyof typeof WIDTH;
}) {
  return <div className={cn("mx-auto w-full px-6 py-8", WIDTH[width], className)}>{children}</div>;
}
