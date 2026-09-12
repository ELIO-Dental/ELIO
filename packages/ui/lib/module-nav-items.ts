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
  Settings,
  Wrench,
  Link2,
  BookOpen,
  FlaskConical,
  Calendar,
  Archive,
  Bell,
} from "lucide-react";
import type { ModuleNavLink } from "../components/module-app-layout";

// Paths are relative to each zone app's basePath (/pay, /plans, /flow).
// Next.js Link/router auto-prefixes basePath — including the zone prefix here
// produces double URLs like /plans/plans/patients (404).
export const PAY_MODULE_NAV: ModuleNavLink[] = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: LayoutDashboard, exact: true },
  { id: "pay-periods", label: "Pay Periods", href: "/pay-periods", icon: Calendar },
  { id: "dentists", label: "Dentists", href: "/dentists", icon: Users },
  { id: "lab-bills", label: "Lab Bills", href: "/lab-bills", icon: FlaskConical },
  { id: "supplier-invoices", label: "Supplier Invoices", href: "/supplier-invoices", icon: FileText },
  { id: "bulk-payments", label: "Bulk Payments", href: "/bulk-payments", icon: CreditCard },
  { id: "legacy-payslips", label: "Legacy Archive", href: "/legacy-payslips", icon: Archive },
  { id: "reporting", label: "Reporting", href: "/reporting", icon: BarChart3 },
  { id: "setup", label: "Setup", href: "/setup", icon: Wrench },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

export const PLANS_MODULE_NAV: ModuleNavLink[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { id: "patients", label: "Patients", href: "/patients", icon: Users },
  { id: "plans", label: "Plans", href: "/plans", icon: HeartHandshake },
  { id: "redeems", label: "Redeems", href: "/redeems", icon: Gift },
  { id: "payments", label: "Payments", href: "/payments", icon: CreditCard },
  { id: "reconciliation", label: "Reconciliation", href: "/reconciliation", icon: Scale },
  { id: "dentally", label: "Dentally", href: "/dentally", icon: Link2 },
  { id: "documents", label: "Documents", href: "/documents", icon: FileText },
  { id: "reports", label: "Reports", href: "/reports", icon: BarChart3 },
  { id: "action-required", label: "Action Required", href: "/action-required", icon: AlertCircle },
  { id: "guide", label: "Guide", href: "/guide", icon: BookOpen },
  // Team/Users live on ELIO Portal — not duplicated in Plans.
  { id: "audit-log", label: "Audit Log", href: "/audit-log", icon: ScrollText },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

export const FLOW_MODULE_NAV: ModuleNavLink[] = [
  // Legacy ElioFlow home was labeled "Pipeline" but was stats+table+charts (not a kanban).
  { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
  // FR-F1 (00_SCOPE.md §5) — "smart reminders until closed" is required
  // scope; classic ElioFlow had no standalone tab for it, but the build
  // guide calls for one and the feature (API/list/form) was fully built.
  { id: "reminders", label: "Reminders", href: "/reminders", icon: Bell },
  // Settings stays in-module (branding / Flow options). Team + auth live on Portal.
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];
