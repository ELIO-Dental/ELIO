import {
  LayoutDashboard,
  Users,
  HeartHandshake,
  CreditCard,
  Scale,
  Gift,
  BarChart3,
  FileText,
  AlertCircle,
  ScrollText,
  UserCog,
  Settings,
  Link2,
  BookOpen,
  FlaskConical,
  Calendar,
  Kanban,
  MessageSquare,
  Bell,
} from "lucide-react";
import type { ModuleNavLink } from "../components/module-app-layout";

// Paths are relative to each zone app's basePath (/pay, /plans, /flow).
// Next.js Link/router auto-prefixes basePath — including the zone prefix here
// produces double URLs like /plans/plans/patients (404).
export const PAY_MODULE_NAV: ModuleNavLink[] = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: LayoutDashboard, exact: true },
  { id: "dentists", label: "Dentists", href: "/dentists", icon: Users },
  { id: "lab-bills", label: "Lab Bills", href: "/lab-bills", icon: FlaskConical },
  { id: "supplier-invoices", label: "Supplier Invoices", href: "/supplier-invoices", icon: FileText },
  { id: "bulk-payments", label: "Bulk Payments", href: "/bulk-payments", icon: CreditCard },
  { id: "pay-periods", label: "Pay Periods", href: "/pay-periods", icon: Calendar },
  { id: "reporting", label: "Reporting", href: "/reporting", icon: BarChart3 },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

export const PLANS_MODULE_NAV: ModuleNavLink[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { id: "patients", label: "Patients", href: "/patients", icon: Users },
  { id: "dentally", label: "Dentally", href: "/dentally", icon: Link2 },
  { id: "plans", label: "Plans", href: "/plans", icon: HeartHandshake },
  { id: "payments", label: "Payments", href: "/payments", icon: CreditCard },
  { id: "reconciliation", label: "Reconciliation", href: "/reconciliation", icon: Scale },
  { id: "redeems", label: "Redeems", href: "/redeems", icon: Gift },
  { id: "reports", label: "Reports", href: "/reports", icon: BarChart3 },
  { id: "documents", label: "Documents", href: "/documents", icon: FileText },
  { id: "guide", label: "Guide", href: "/guide", icon: BookOpen },
  { id: "action-required", label: "Action Required", href: "/action-required", icon: AlertCircle },
  { id: "audit-log", label: "Audit Log", href: "/audit-log", icon: ScrollText },
  { id: "users", label: "Users", href: "/users", icon: UserCog },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

export const FLOW_MODULE_NAV: ModuleNavLink[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { id: "pipeline", label: "Board", href: "/pipeline", icon: Kanban },
  { id: "reporting", label: "Reporting", href: "/reporting", icon: BarChart3 },
  { id: "enquiries", label: "Enquiries", href: "/enquiries", icon: MessageSquare },
  { id: "reminders", label: "Reminders", href: "/reminders", icon: Bell },
];
