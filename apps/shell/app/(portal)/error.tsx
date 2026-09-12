"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { EmptyState, PageContent } from "@elio/ui";

/**
 * apps/shell had NO error.tsx anywhere (found in a 2026-09-12 UI-stability
 * review) — any thrown error in a Server Component under (portal) (e.g.
 * loading team members, integrations status, or profile data) fell
 * through to Next.js's default unstyled error screen: no sidebar, no
 * retry, out of brand entirely — for the app every user hits first. Placed
 * inside (portal) rather than at the app root so PortalLayout's sidebar
 * (rendered by (portal)/layout.tsx, which wraps this boundary, not the
 * other way around) stays visible — the user can still navigate to another
 * module or sign out, not just stare at a dead end.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[shell] Unhandled error in portal route:", error);
  }, [error]);

  return (
    <PageContent>
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        description={error.message || "An unexpected error occurred loading this page."}
        action={{ label: "Try again", onClick: reset }}
        className="py-16"
      />
    </PageContent>
  );
}
