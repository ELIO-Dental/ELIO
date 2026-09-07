import { redirectToLogin, redirectUnlessPayViewAll } from "@/lib/session";
import { auth } from "@elio/auth";
import type { Role } from "@elio/db";
import { scopedDb } from "@elio/db";
import { PageContent } from "@elio/ui";
import { LabBillsClient } from "./lab-bills-client";
import type { LabBillListItem } from "@/lib/lab-bills-summary";
import { listLabBills } from "@/lib/pay-service";

export default async function LabBillsPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  await redirectUnlessPayViewAll(session.role as Role);

  const db = scopedDb(session.practiceId);
  const currentYear = new Date().getUTCFullYear();

  const [labBills, dentists, savedLabs] = await Promise.all([
    listLabBills(session.practiceId, { year: currentYear }),
    db.dentist.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
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
    billDate: b.billDate?.toISOString().slice(0, 10) ?? null,
    paid: b.paid,
    paidAt: b.paidAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
  }));

  return (
    <PageContent>
      <LabBillsClient
        initialLabBills={rows}
        dentists={dentists}
        savedLabs={savedLabs}
        initialYear={currentYear}
      />
    </PageContent>
  );
}
