import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState } from "@elio/ui";
import { PayNav } from "@/components/pay-nav";
import { NewDentistForm } from "./new-dentist-form";

export default async function DentistsPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();

  const db = scopedDb(session.practiceId);
  const dentists = await db.dentist.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <PayNav isOwner={session.role === "OWNER"} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-h2 text-(--color-text-primary)">Dentists</h1>
        </div>

        <div className="mt-6">
          <NewDentistForm />
        </div>

        <div className="mt-8">
          {dentists.length === 0 ? (
            <EmptyState title="No dentists yet" description="Add your first dentist above." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>NHS performer #</TableHead>
                  <TableHead>Pay type</TableHead>
                  <TableHead>Split % / UDA rate</TableHead>
                  <TableHead>Hourly rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dentists.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.name}</TableCell>
                    <TableCell>{d.nhsPerformerNumber ?? "—"}</TableCell>
                    <TableCell>{d.payType}</TableCell>
                    <TableCell>
                      {d.payType === "PERCENTAGE_SPLIT"
                        ? `${d.privateSplitPercent}% / £${((d.udaRatePence ?? 0) / 100).toFixed(2)}`
                        : "—"}
                    </TableCell>
                    <TableCell>{d.payType === "HOURLY" ? `£${((d.hourlyRatePence ?? 0) / 100).toFixed(2)}/hr` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
