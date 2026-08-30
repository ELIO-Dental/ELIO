import { requireLicensedSession } from "@/lib/session";
import { prisma } from "@elio/db";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  PageContent,
  PageHeader,
  TablePanel,
  TableToolbar,
  TablePagination,
  parseTablePage,
} from "@elio/ui";
import { DocumentsEmptyState } from "@/components/documents-empty-state";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireLicensedSession();
  const practiceId = session.practiceId;
  const { page, skip, pageSize } = parseTablePage(await searchParams);

  const [documents, totalCount] = await Promise.all([
    prisma.planDocument.findMany({
      where: { practiceId },
      include: {
        _count: { select: { acceptances: true, signingRequests: true } },
        signingRequests: { select: { signedAt: true } },
      },
      orderBy: { effectiveDate: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.planDocument.count({ where: { practiceId } }),
  ]);

  return (
    <PageContent>
      <PageHeader
        title="Documents"
        description="Terms & conditions and plan agreements, with acceptance and e-signing status."
      />

      <div className="mt-8">
        {totalCount === 0 ? (
          <TablePanel toolbar={<TableToolbar title="Documents" />}>
            <DocumentsEmptyState
              title="No documents yet"
              description="Terms & conditions and plan agreements will appear here once created."
              className="py-12"
            />
          </TablePanel>
        ) : (
          <TablePanel
            toolbar={<TableToolbar title="Documents" />}
            footer={<TablePagination page={page} pageSize={pageSize} totalCount={totalCount} />}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Accepted</TableHead>
                  <TableHead>Signing requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => {
                  const signedCount = doc.signingRequests.filter((r) => r.signedAt).length;
                  return (
                    <TableRow key={doc.id}>
                      <TableCell>{doc.title}</TableCell>
                      <TableCell>
                        <Badge variant="neutral">{doc.type.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-(--color-text-secondary)">{doc.version}</TableCell>
                      <TableCell>
                        <Badge variant={doc.isActive ? "success" : "neutral"}>{doc.isActive ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-(--color-text-tertiary)">{doc.effectiveDate.toISOString().slice(0, 10)}</TableCell>
                      <TableCell className="font-(--font-mono) tabular-nums">{doc._count.acceptances}</TableCell>
                      <TableCell className="font-(--font-mono) tabular-nums">
                        {signedCount} / {doc._count.signingRequests} signed
                      </TableCell>
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
