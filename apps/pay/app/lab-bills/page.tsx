import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { LabBillsClient } from "./lab-bills-client";

export default async function LabBillsPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();

  const db = scopedDb(session.practiceId);
  const [labBills, dentists] = await Promise.all([
    db.labBillEntry.findMany({
      include: { dentist: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.dentist.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <PageContent>
      <PageHeader title="Lab Bills" description="Track lab work deductions per dentist." />

      <div className="mt-8">
        <LabBillsClient
          initialLabBills={labBills.map((b) => ({
            id: b.id,
            dentistId: b.dentistId,
            dentistName: b.dentist?.name ?? null,
            amountPence: b.amountPence,
            description: b.description,
            createdAt: b.createdAt.toISOString(),
          }))}
          dentists={dentists}
        />
      </div>
    </PageContent>
  );
}
