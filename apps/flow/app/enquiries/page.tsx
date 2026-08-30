import { requireSession, redirectToLogin } from "@/lib/session";
import { prisma } from "@elio/db";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
  PageContent,
  PageHeader,
  TablePanel,
  TableToolbar,
  TablePagination,
  parseTablePage,
} from "@elio/ui";
import { CaptureEnquiryForm } from "./capture-enquiry-form";

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireSession();
  if (!session) return redirectToLogin();
  const practiceId = session.practiceId;
  const { page, skip, pageSize } = parseTablePage(await searchParams);

  const enquiryWhere = { practiceId, consults: { none: {} } };

  const [enquiries, totalCount, patients] = await Promise.all([
    prisma.enquiry.findMany({
      where: enquiryWhere,
      include: { patient: true },
      orderBy: { capturedAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.enquiry.count({ where: enquiryWhere }),
    prisma.patient.findMany({ where: { practiceId }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  return (
    <PageContent>
      <PageHeader
        title="Enquiries"
        description="Capture a new lead. Linking to a Dentally patient is optional — a phone enquiry can be logged before the person is a known patient."
      />

      <div className="mt-8">
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
        <h2 className="mb-3 text-h4 text-(--color-text-primary)">Awaiting a consult</h2>
        {totalCount === 0 ? (
          <TablePanel toolbar={<TableToolbar title="Open enquiries" />}>
            <EmptyState title="No open enquiries" description="Captured leads with no consult booked yet will appear here." className="py-12" />
          </TablePanel>
        ) : (
          <TablePanel
            toolbar={<TableToolbar title="Open enquiries" />}
            footer={<TablePagination page={page} pageSize={pageSize} totalCount={totalCount} />}
          >
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
          </TablePanel>
        )}
      </div>
    </PageContent>
  );
}
