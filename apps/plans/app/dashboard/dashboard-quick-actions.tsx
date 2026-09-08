import Link from "next/link";
import { AlertCircle, BarChart3, CreditCard, UserPlus } from "lucide-react";
import { PlansSection } from "@/components/plans-page-chrome";

/** Legacy quick actions row — modern surface tiles. */
export function DashboardQuickActions() {
  const actions = [
    {
      href: "/patients?openEnrol=1",
      icon: UserPlus,
      title: "Add patient",
      description: "Enrol or import from Dentally",
    },
    {
      href: "/patients?status=INVITED",
      icon: CreditCard,
      title: "Send invite",
      description: "Invite pending patients",
    },
    {
      href: "/payments?status=FAILED",
      icon: AlertCircle,
      title: "Failed payments",
      description: "Review failures",
    },
    {
      href: "/reports",
      icon: BarChart3,
      title: "View reports",
      description: "Analytics and exports",
    },
  ] as const;

  return (
    <PlansSection title="Quick actions" subtitle="Common membership tasks">
      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <Link
            key={action.href + action.title}
            href={action.href}
            className="group flex items-start gap-3 rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-bg-subtle)/30 px-3.5 py-3 transition-colors hover:border-(--color-border) hover:bg-(--color-bg-subtle)/70"
          >
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-50) text-(--color-primary-600) transition-colors group-hover:bg-(--color-primary-100)">
              <action.icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-body-sm font-semibold text-(--color-text-primary)">{action.title}</span>
              <span className="mt-0.5 block text-caption text-(--color-text-tertiary)">{action.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </PlansSection>
  );
}
