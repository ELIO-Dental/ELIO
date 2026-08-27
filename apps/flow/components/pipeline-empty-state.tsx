"use client";

// Server Components can't pass a raw icon component reference across the RSC
// boundary to a Client Component — EmptyState is "use client". Same fix
// pattern as apps/plans/components/documents-empty-state.tsx.
import { EmptyState, type EmptyStateProps } from "@elio/ui";
import { Inbox } from "lucide-react";

export function PipelineEmptyState(props: Omit<EmptyStateProps, "icon">) {
  return <EmptyState {...props} icon={Inbox} />;
}
