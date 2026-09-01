import { prisma } from "@elio/db";
import { can, type PermissionSubject } from "@elio/auth";

import {
  consultMatchesPractitionerScope,
  resolveEffectiveDentistFilter,
  type FlowPractitionerScope,
} from "./flow-scope-utils";

export type { FlowPractitionerScope };
export { consultMatchesPractitionerScope, resolveEffectiveDentistFilter };

export class ConsultScopeError extends Error {
  status = 403;
  constructor(message = "Not allowed to access this consult") {
    super(message);
  }
}

/** F3.2 — legacy can-view-all-patients: linked clinicians see only their own rows. */
export async function resolveFlowPractitionerScope(
  practiceId: string,
  subject: PermissionSubject & { userId: string }
): Promise<FlowPractitionerScope> {
  if (can(subject, "flow:view-all-patients")) {
    return { viewAll: true, dentistId: null };
  }

  const dentist = await prisma.dentist.findFirst({
    where: { practiceId, userId: subject.userId },
    select: { id: true },
  });

  if (!dentist) {
    return { viewAll: true, dentistId: null };
  }

  return { viewAll: false, dentistId: dentist.id };
}

/** Throws ConsultScopeError when a linked clinician tries to access another dentist's consult. */
export async function assertConsultInScope(
  practiceId: string,
  consultId: string,
  scope: FlowPractitionerScope
): Promise<void> {
  if (scope.viewAll || !scope.dentistId) return;

  const consult = await prisma.consult.findFirst({
    where: { id: consultId, practiceId },
    select: { practitionerDentistId: true },
  });
  if (!consult) return;
  if (!consultMatchesPractitionerScope(consult, scope)) {
    throw new ConsultScopeError();
  }
}
