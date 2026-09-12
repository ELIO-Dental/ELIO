"use client";

// Server Components can't pass a raw icon component reference (a function)
// across the RSC boundary to a Client Component — EmptyState is "use client".
// This thin client wrapper imports the icon locally so page.tsx stays a
// server component and only passes serializable props down. Same fix
// pattern as apps/plans/components/documents-empty-state.tsx and siblings —
// found live 2026-09-12 after the identical bug (icon={Icon} instead of a
// wrapper) took down apps/pay's dashboard with a production 500.
import { EmptyState, type EmptyStateProps } from "@elio/ui";
import { ScrollText } from "lucide-react";

export function AuditEmptyState(props: Omit<EmptyStateProps, "icon">) {
  return <EmptyState {...props} icon={ScrollText} />;
}
