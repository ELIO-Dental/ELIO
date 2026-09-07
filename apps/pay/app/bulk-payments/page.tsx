import { redirectToLogin, redirectUnlessPayViewAll } from "@/lib/session";
import { auth } from "@elio/auth";
import type { Role } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { BulkPaymentsClient } from "./bulk-payments-client";

export default async function BulkPaymentsPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  await redirectUnlessPayViewAll(session.role as Role);

  return (
    <PageContent>
      <PageHeader
        title="Bulk Payments"
        description="Manage bank details and generate bulk payment files"
      />
      <BulkPaymentsClient />
    </PageContent>
  );
}
