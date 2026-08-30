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
  FlaskConical,
  Calendar,
  Kanban,
  MessageSquare,
  Bell,
} from "lucide-react";
import type { ModuleNavLink } from "../components/module-app-layout";

export const PAY_MODULE_NAV: ModuleNavLink[] = [
  { id: "dashboard", label: "Dashboard", href: "/pay", icon: LayoutDashboard, exact: true },
  { id: "dentists", label: "Dentists", href: "/pay/dentists", icon: Users },
  { id: "lab-bills", label: "Lab Bills", href: "/pay/lab-bills", icon: FlaskConical },
  { id: "supplier-invoices", label: "Supplier Invoices", href: "/pay/supplier-invoices", icon: FileText },
  { id: "bulk-payments", label: "Bulk Payments", href: "/pay/bulk-payments", icon: CreditCard },
  { id: "pay-periods", label: "Pay Periods", href: "/pay/pay-periods", icon: Calendar },
  { id: "reporting", label: "Reporting", href: "/pay/reporting", icon: BarChart3 },
  { id: "settings", label: "Settings", href: "/pay/settings", icon: Settings },
];

export const PLANS_MODULE_NAV: ModuleNavLink[] = [
  { id: "dashboard", label: "Dashboard", href: "/plans/dashboard", icon: LayoutDashboard },
  { id: "patients", label: "Patients", href: "/plans/patients", icon: Users },
  { id: "plans", label: "Plans", href: "/plans/plans", icon: HeartHandshake },
  { id: "payments", label: "Payments", href: "/plans/payments", icon: CreditCard },
  { id: "reconciliation", label: "Reconciliation", href: "/plans/reconciliation", icon: Scale },
  { id: "redeems", label: "Redeems", href: "/plans/redeems", icon: Gift },
  { id: "reports", label: "Reports", href: "/plans/reports", icon: BarChart3 },
  { id: "documents", label: "Documents", href: "/plans/documents", icon: FileText },
  { id: "action-required", label: "Action Required", href: "/plans/action-required", icon: AlertCircle },
  { id: "audit-log", label: "Audit Log", href: "/plans/audit-log", icon: ScrollText },
  { id: "users", label: "Users", href: "/plans/users", icon: UserCog },
  { id: "settings", label: "Settings", href: "/plans/settings", icon: Settings },
];

export const FLOW_MODULE_NAV: ModuleNavLink[] = [
  { id: "pipeline", label: "Pipeline", href: "/flow/pipeline", icon: Kanban },
  { id: "reporting", label: "Reporting", href: "/flow/reporting", icon: BarChart3 },
  { id: "enquiries", label: "Enquiries", href: "/flow/enquiries", icon: MessageSquare },
  { id: "reminders", label: "Reminders", href: "/flow/reminders", icon: Bell },
];
