import { requireLicensedSession } from "@/lib/session";
import { prisma } from "@elio/db";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge } from "@elio/ui";
import { PlansNav } from "@/components/plans-nav";
import { DocumentsEmptyState } from "@/components/documents-empty-state";

export default async function DocumentsPage() {
  const session = await requireLicensedSession();
  const practiceId = session.practiceId;

  const documents = await prisma.planDocument.findMany({
    where: { practiceId },
    include: {
      _count: { select: { acceptances: true, signingRequests: true } },
      signingRequests: { select: { signedAt: true } },
    },
    orderBy: { effectiveDate: "desc" },
    take: 200,
  });

  return (
    <div>
      <PlansNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-[--color-text-primary]">Documents</h1>
        <p className="mt-1 text-body text-[--color-text-secondary]">
          Terms &amp; conditions and plan agreements, with acceptance and e-signing status.
        </p>

        <div className="mt-8">
          {documents.length === 0 ? (
            <div className="rounded-[--radius-lg] border border-[--color-border]">
              <DocumentsEmptyState
                title="No documents yet"
                description="Terms & conditions and plan agreements will appear here once created."
              />
            </div>
          ) : (
            <div className="rounded-[--radius-lg] border border-[--color-border]">
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
                        <TableCell className="text-[--color-text-secondary]">{doc.version}</TableCell>
                        <TableCell>
                          <Badge variant={doc.isActive ? "success" : "neutral"}>
                            {doc.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[--color-text-tertiary]">
                          {doc.effectiveDate.toISOString().slice(0, 10)}
                        </TableCell>
                        <TableCell className="tabular-nums font-[--font-mono]">{doc._count.acceptances}</TableCell>
                        <TableCell className="tabular-nums font-[--font-mono]">
                          {signedCount} / {doc._count.signingRequests} signed
                        </TableCell>
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
