import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { LabBillsClient } from "./lab-bills-client";
import type { LabBillListItem } from "@/lib/lab-bills-summary";

export default async function LabBillsPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();

  const db = scopedDb(session.practiceId);
  const currentYear = new Date().getUTCFullYear();
  const [labBills, dentists, savedLabs] = await Promise.all([
    db.labBillEntry.findMany({
      include: {
        dentist: { select: { id: true, name: true } },
        savedLab: { select: { id: true, name: true } },
      },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
    }),
    db.dentist.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.savedLab.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows: LabBillListItem[] = labBills.map((b) => ({
    id: b.id,
    labName: b.labName ?? b.savedLab?.name ?? null,
    dentistId: b.dentistId,
    dentistName: b.dentist?.name ?? null,
    amountPence: b.amountPence,
    description: b.description,
    fileUrl: b.fileUrl,
    billDate: b.billDate?.toISOString() ?? null,
    paid: b.paid,
    paidAt: b.paidAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
  }));

  return (
    <PageContent>
      <PageHeader title="Lab Bills" description="Track and manage dental lab bills." />

      <div className="mt-8">
        <LabBillsClient
          initialLabBills={rows}
          dentists={dentists}
          savedLabs={savedLabs}
          initialYear={currentYear}
        />
      </div>
    </PageContent>
  );
}
