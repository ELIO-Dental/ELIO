// Full RBAC matrix — project-docs/PERMISSIONS_MATRIX.md is authoritative; no
// permission name here that isn't listed there. This is the ONE shared
// `can(user, action, resource)` check (ENGINEERING_CONVENTIONS.md section 5)
// every module route/UI must call — never a scattered `if (role === 'ADMIN')`.
import type { Role } from "@elio/db";

// Shell-level permissions (PERMISSIONS_MATRIX.md section 2).
const SHELL_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: ["superadmin:console"],
  OWNER: [
    "modules:use",
    "team:view",
    "team:manage", // invite/deactivate/change roles
    "mfa:toggle", // "Require MFA for all staff"
    "auditlog:view:all",
    "practice:manage",
    "staff:manage",
    "billing:manage",
  ],
  ADMIN: ["modules:use", "team:view", "auditlog:view:own", "staff:manage"],
  FINANCE: ["modules:use"],
  STAFF: ["modules:use"],
  AUDITOR: ["modules:use:readonly", "auditlog:view:all"],
};

// ElioPay permissions (PERMISSIONS_MATRIX.md section 3).
const PAY_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: [],
  OWNER: ["pay:view", "pay:configure-splits", "pay:upload-statement", "pay:review-nhs-figure", "pay:manual-adjustment", "pay:run-period", "pay:edit-bills", "pay:download-payslip"],
  ADMIN: ["pay:view", "pay:configure-splits", "pay:upload-statement", "pay:review-nhs-figure", "pay:manual-adjustment", "pay:run-period", "pay:edit-bills", "pay:download-payslip"],
  FINANCE: ["pay:view", "pay:configure-splits", "pay:upload-statement", "pay:review-nhs-figure", "pay:manual-adjustment", "pay:run-period", "pay:edit-bills", "pay:download-payslip"],
  STAFF: [], // default: no access unless a clinician-facing view is added — open item, PERMISSIONS_MATRIX.md section 7
  AUDITOR: ["pay:view:readonly", "pay:download-payslip:readonly"],
};

// ElioPlans permissions (PERMISSIONS_MATRIX.md section 4).
const PLANS_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: [],
  OWNER: ["plans:edit", "plans:invite-patients", "plans:view-payments", "plans:resolve-mismatch", "plans:edit-settings"],
  ADMIN: ["plans:edit", "plans:invite-patients", "plans:view-payments", "plans:resolve-mismatch", "plans:edit-settings"],
  FINANCE: ["plans:invite-patients", "plans:view-payments", "plans:resolve-mismatch"],
  STAFF: ["plans:invite-patients", "plans:view-payments:readonly"],
  AUDITOR: ["plans:view-payments:readonly"],
};

// ElioFlow permissions (PERMISSIONS_MATRIX.md section 5).
const FLOW_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: [],
  OWNER: ["flow:view", "flow:capture-enquiry", "flow:trigger-handoff"],
  ADMIN: ["flow:view", "flow:capture-enquiry", "flow:trigger-handoff"],
  FINANCE: ["flow:view:readonly"],
  STAFF: ["flow:view", "flow:capture-enquiry", "flow:trigger-handoff"],
  AUDITOR: ["flow:view:readonly"],
};

// Super Admin console (PERMISSIONS_MATRIX.md section 2a) — SUPER_ADMIN only.
const SUPERADMIN_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: [
    "tenant:view-all",
    "tenant:view-user-hierarchy",
    "tenant:toggle-licence",
    "tenant:change-plan",
    "tenant:toggle-feature-flag",
    "tenant:suspend",
    "tenant:impersonate",
    "platform:view-metrics",
  ],
  OWNER: [],
  ADMIN: [],
  FINANCE: [],
  STAFF: [],
  AUDITOR: [],
};

const ALL_MAPS: Record<Role, string[]>[] = [
  SHELL_PERMISSIONS,
  PAY_PERMISSIONS,
  PLANS_PERMISSIONS,
  FLOW_PERMISSIONS,
  SUPERADMIN_PERMISSIONS,
];

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: [],
  OWNER: [],
  ADMIN: [],
  FINANCE: [],
  STAFF: [],
  AUDITOR: [],
};

for (const map of ALL_MAPS) {
  for (const role of Object.keys(map) as Role[]) {
    ROLE_PERMISSIONS[role].push(...map[role]);
  }
}

export function permissionsForRole(role: Role): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Minimal shape needed to evaluate a permission — anything with a `role`
 * (a session, JWT payload, or DB User row) satisfies this. */
export interface PermissionSubject {
  role: Role;
}

/**
 * The ONE shared permission-check function every module step calls —
 * ENGINEERING_CONVENTIONS.md section 5 / PERMISSIONS_MATRIX.md section 6.
 * `resource` is accepted for future scoping (e.g. practice-id checks) but
 * unused today — every permission is already practice-scoped by the caller
 * having loaded `resource` from the session's own practiceId.
 */
export function can(user: PermissionSubject | null | undefined, action: string, _resource?: unknown): boolean {
  if (!user) return false;
  return permissionsForRole(user.role).includes(action);
}
