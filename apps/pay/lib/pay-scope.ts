import { scopedDb } from "@elio/db";
import { can, type PermissionSubject } from "@elio/auth/lib/permissions";
import { ForbiddenError } from "./errors";
import {
  filterPayslipsForScope,
  payslipMatchesPractitionerScope,
  type PayPractitionerScope,
} from "./pay-scope-utils";

export type { PayPractitionerScope };
export { filterPayslipsForScope, payslipMatchesPractitionerScope };

export function canPayViewAll(subject: PermissionSubject): boolean {
  return can(subject, "pay:view") || can(subject, "pay:view:readonly");
}

export function canPayViewOwn(subject: PermissionSubject): boolean {
  return can(subject, "pay:view-own-payslip");
}

export function canPayViewAny(subject: PermissionSubject): boolean {
  return canPayViewAll(subject) || canPayViewOwn(subject);
}

export function canPayDownloadAny(subject: PermissionSubject): boolean {
  return (
    can(subject, "pay:download-payslip") ||
    can(subject, "pay:download-payslip:readonly") ||
    can(subject, "pay:download-payslip:own")
  );
}

/** Step 30 — linked clinicians see only their own payslips; ops see all. */
export async function resolvePayPractitionerScope(
  practiceId: string,
  subject: PermissionSubject & { userId: string }
): Promise<PayPractitionerScope> {
  if (canPayViewAll(subject)) {
    return { viewAll: true, dentistId: null };
  }

  if (!canPayViewOwn(subject) && !can(subject, "pay:download-payslip:own")) {
    return { viewAll: false, dentistId: null };
  }

  const db = scopedDb(practiceId);
  const dentist = await db.dentist.findFirst({
    where: { practiceId, userId: subject.userId },
    select: { id: true },
  });

  if (!dentist) {
    return { viewAll: false, dentistId: null };
  }

  return { viewAll: false, dentistId: dentist.id };
}

/** Throws ForbiddenError when a clinician tries to access another dentist's payslip. */
export async function assertPayslipInScope(
  practiceId: string,
  payslipEntryId: string,
  scope: PayPractitionerScope
): Promise<void> {
  if (scope.viewAll) return;

  if (!scope.dentistId) {
    throw new ForbiddenError("Not allowed to access this payslip");
  }

  const db = scopedDb(practiceId);
  const payslip = await db.payslipEntry.findFirst({
    where: { id: payslipEntryId, practiceId },
    select: { dentistId: true },
  });
  if (!payslip || !payslipMatchesPractitionerScope(payslip, scope)) {
    throw new ForbiddenError("Not allowed to access this payslip");
  }
}
