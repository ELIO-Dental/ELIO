import { SearchX } from "lucide-react";
import { EmptyState, PageContent } from "@elio/ui";

/**
 * apps/admin called notFound() (e.g. tenants/[id]/page.tsx for an unknown
 * tenant id) with no matching not-found.tsx anywhere, so it fell through to
 * Next.js's default unstyled 404 — found in the same 2026-09-12
 * UI-stability review as the sibling error.tsx gap. Placed inside
 * (protected) so AdminNav's chrome stays visible, same reasoning as
 * error.tsx.
 */
export default function ProtectedNotFound() {
  return (
    <PageContent>
      <EmptyState
        icon={SearchX}
        title="Not found"
        description="This page, tenant, or resource doesn't exist or may have been removed."
        className="py-16"
      />
    </PageContent>
  );
}
