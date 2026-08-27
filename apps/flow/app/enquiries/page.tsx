import { requireSession, redirectToLogin } from "@/lib/session";
import { FlowNav } from "@/components/flow-nav";
import { prisma } from "@elio/db";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState } from "@elio/ui";
import { CaptureEnquiryForm } from "./capture-enquiry-form";

export default async function EnquiriesPage() {
  const session = await requireSession();
  if (!session) return redirectToLogin();
  const practiceId = session.practiceId;

  const [enquiries, patients] = await Promise.all([
    // Mirrors listPipeline()'s "capture" column condition: an Enquiry with
    // no Consult row yet at all — nothing has been booked/recorded for it.
    prisma.enquiry.findMany({
      where: { practiceId, consults: { none: {} } },
      include: { patient: true },
      orderBy: { capturedAt: "desc" },
    }),
    prisma.patient.findMany({ where: { practiceId }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  return (
    <div>
      <FlowNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-(--color-text-primary)">Enquiries</h1>
        <p className="mt-1 text-body text-(--color-text-secondary)">
          Capture a new lead. Linking to a Dentally patient is optional — a phone enquiry can be logged before the
          person is a known patient.
        </p>

        <div className="mt-6">
          <CaptureEnquiryForm
            patients={patients.map((p) => ({
              id: p.id,
              firstName: p.firstName,
              lastName: p.lastName,
              email: p.email,
            }))}
          />
        </div>

        <div className="mt-8">
          <h2 className="text-h4 text-(--color-text-primary)">Awaiting a consult</h2>
          {enquiries.length === 0 ? (
            <div className="mt-3 rounded-(--radius-lg) border border-(--color-border)">
              <EmptyState title="No open enquiries" description="Captured leads with no consult booked yet will appear here." />
            </div>
          ) : (
            <div className="mt-3 rounded-(--radius-lg) border border-(--color-border)">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Captured</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enquiries.map((e) => {
                    const name = e.patient
                      ? [e.patient.firstName, e.patient.lastName].filter(Boolean).join(" ") || "Unnamed patient"
                      : "Unlinked lead";
                    return (
                      <TableRow key={e.id}>
                        <TableCell>{name}</TableCell>
                        <TableCell>{e.source ?? "—"}</TableCell>
                        <TableCell>{e.capturedAt.toLocaleDateString("en-GB")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
