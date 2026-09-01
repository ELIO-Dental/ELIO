import Link from "next/link";
import { AlertCircle, BarChart3, CreditCard, Users } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@elio/ui";

/** Legacy quick actions row (P3.3). */
export function DashboardQuickActions() {
  const actions = [
    {
      href: "/patients",
      icon: Users,
      title: "Add patient",
      description: "Enrol or import from Dentally",
    },
    {
      href: "/patients",
      icon: CreditCard,
      title: "Send invite",
      description: "Invite to sign up",
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
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {actions.map((action) => (
          <Button key={action.href + action.title} variant="secondary" className="h-auto justify-start py-4" asChild>
            <Link href={action.href}>
              <action.icon className="mr-2 size-4 shrink-0" />
              <div className="text-left">
                <p className="font-medium">{action.title}</p>
                <p className="text-caption text-(--color-text-tertiary)">{action.description}</p>
              </div>
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
