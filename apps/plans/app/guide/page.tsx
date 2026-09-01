import { can, requireLicensedSession } from "@/lib/session";
import type { Role } from "@elio/db";
import { listGuideArticles } from "@/lib/guides-service";
import { PageContent, PageHeader, TablePanel, TableToolbar } from "@elio/ui";
import { GuideManager } from "./guide-manager";

export default async function GuidePage() {
  const session = await requireLicensedSession();
  const canEdit = can({ role: session.role as Role }, "plans:edit-settings");

  const articles = await listGuideArticles(session.practiceId, { publishedOnly: true });

  const rows = articles.map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    content: a.content,
    category: a.category,
    sortOrder: a.sortOrder,
    published: a.published,
  }));

  return (
    <PageContent>
      <PageHeader title="Guide" description="Help articles for staff using the Plans module." />

      <div className="mt-8">
        <TablePanel toolbar={<TableToolbar title="Guide" />}>
          <GuideManager articles={rows} canEdit={canEdit} />
        </TablePanel>
      </div>
    </PageContent>
  );
}
