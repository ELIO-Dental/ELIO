import { SearchX } from "lucide-react";
import { EmptyState, PageContent } from "@elio/ui";

/**
 * apps/shell had no not-found.tsx anywhere — found in the same 2026-09-12
 * UI-stability review as the sibling error.tsx gap. Placed inside (portal)
 * so PortalLayout's sidebar stays visible, same reasoning as error.tsx.
 */
export default function PortalNotFound() {
  return (
    <PageContent>
      <EmptyState
        icon={SearchX}
        title="Not found"
        description="This page or resource doesn't exist or may have been removed."
        className="py-16"
      />
    </PageContent>
  );
}
