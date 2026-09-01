import { can, requireLicensedSession } from "@/lib/session";
import type { Role } from "@elio/db";
import { listDocuments } from "@/lib/documents-service";
import { PageContent, PageHeader, TablePanel, TableToolbar } from "@elio/ui";
import { DocumentsManager } from "./documents-manager";

export default async function DocumentsPage() {
  const session = await requireLicensedSession();
  const canEdit = can({ role: session.role as Role }, "plans:edit-settings");

  const documents = await listDocuments(session.practiceId);

  const rows = documents.map((doc) => ({
    id: doc.id,
    type: doc.type,
    title: doc.title,
    content: doc.content,
    version: doc.version,
    effectiveDate: doc.effectiveDate.toISOString(),
    isActive: doc.isActive,
    acceptanceCount: doc._count.acceptances,
    signingCount: doc._count.signingRequests,
    signedCount: doc.signingRequests.filter((r) => r.signedAt).length,
  }));

  return (
    <PageContent>
      <PageHeader
        title="Documents"
        description="Terms & conditions and plan agreements, with acceptance and e-signing status."
      />

      <div className="mt-8">
        <TablePanel toolbar={<TableToolbar title="Documents" />}>
          <DocumentsManager documents={rows} canEdit={canEdit} />
        </TablePanel>
      </div>
    </PageContent>
  );
}
