"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { EmptyState, PageContent } from "@elio/ui";

/**
 * apps/admin had NO error.tsx anywhere (found in a 2026-09-12 UI-stability
 * review) — any thrown error in a Server Component under (protected) (e.g.
 * a DB error loading the tenant list or a tenant's detail page) fell
 * through to Next.js's default unstyled error screen: no chrome, no retry,
 * out of brand entirely. Placed inside (protected) rather than at the app
 * root so AdminNav's sidebar/header (rendered by (protected)/layout.tsx,
 * which wraps this boundary, not the other way around) stays visible and
 * usable — the Super Admin can still navigate away, not just stare at a
 * dead end.
 */
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] Unhandled error in protected route:", error);
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
