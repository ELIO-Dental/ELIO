import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { PayNav } from "@/components/pay-nav";
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
    <div>
      <PayNav isOwner={session.role === "OWNER"} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-h2 text-(--color-text-primary)">Lab Bills</h1>
        </div>

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
    </div>
  );
}
