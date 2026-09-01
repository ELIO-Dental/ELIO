import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { PageContent, PageHeader } from "@elio/ui";
import { BulkPaymentsClient } from "./bulk-payments-client";

export default async function BulkPaymentsPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();

  return (
    <PageContent>
      <PageHeader
        title="Bulk Payments"
        description="Manage bank details and generate Starling bulk payment files."
      />
      <BulkPaymentsClient />
    </PageContent>
  );
}
