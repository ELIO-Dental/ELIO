import { notFound } from "next/navigation";
import { can, requireLicensedSession } from "@/lib/session";
import type { Role } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { getPlanPatientDetail } from "@/lib/plans-service";
import { PatientDetailClient } from "./patient-detail-client";

/** Plan patient detail page (P2.3). */
export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireLicensedSession();
  const { id } = await params;
  const detail = await getPlanPatientDetail(session.practiceId, id);
  if (!detail) notFound();

  const canManage = can({ role: session.role as Role }, "plans:invite-patients");
  const name = [detail.patient.firstName, detail.patient.lastName].filter(Boolean).join(" ") || "Patient";

  const serialized = {
    id: detail.id,
    status: detail.status,
    createdAt: detail.createdAt.toISOString(),
    patient: detail.patient,
    planModel: detail.planModel,
    mandates: detail.mandates.map((m) => ({
      id: m.id,
      status: m.status,
      gocardlessMandateId: m.gocardlessMandateId,
      createdAt: m.createdAt.toISOString(),
    })),
    payments: detail.payments.map((p) => ({
      id: p.id,
      amountPence: p.amountPence,
      status: p.status,
      billingPeriod: p.billingPeriod,
      createdAt: p.createdAt.toISOString(),
      gocardlessPaymentId: p.gocardlessPaymentId,
    })),
    redeems: detail.redeems.map((r) => ({
      id: r.id,
      itemName: r.itemName,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    patientPlans: detail.patientPlans.map((pp) => ({
      id: pp.id,
      status: pp.status,
      plan: pp.plan,
    })),
    signingRequests: detail.signingRequests.map((s) => ({
      id: s.id,
      token: s.token,
      expiresAt: s.expiresAt.toISOString(),
      signedAt: s.signedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      document: s.document,
    })),
    documentAcceptances: detail.documentAcceptances.map((a) => ({
      id: a.id,
      acceptedAt: a.acceptedAt.toISOString(),
      document: a.document,
    })),
  };

  return (
    <PageContent>
      <PageHeader title={name} description="Membership patient detail" />
      <div className="mt-8">
        <PatientDetailClient detail={serialized} canManage={canManage} />
      </div>
    </PageContent>
  );
}
