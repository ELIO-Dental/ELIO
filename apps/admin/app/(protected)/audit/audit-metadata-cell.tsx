"use client";

/** Expandable JSON metadata for an audit log row. */
export function AuditMetadataCell({ metadata }: { metadata: unknown }) {
  if (metadata == null) {
    return <span className="text-(--color-text-tertiary)">—</span>;
  }

  let formatted: string;
  try {
    formatted = JSON.stringify(metadata, null, 2);
  } catch {
    formatted = String(metadata);
  }

  const preview =
    typeof metadata === "object" && metadata !== null
      ? Object.keys(metadata as object).slice(0, 3).join(", ") || "object"
      : String(metadata).slice(0, 40);

  return (
    <details className="group max-w-xs" data-testid="audit-metadata">
      <summary className="cursor-pointer list-none text-body-sm text-(--color-primary-fg) hover:underline">
        <span className="group-open:hidden">{preview}…</span>
        <span className="hidden group-open:inline">Hide</span>
      </summary>
      <pre className="mt-2 max-h-48 overflow-auto rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-bg-subtle) p-2 font-(--font-mono) text-caption text-(--color-text-secondary)">
        {formatted}
      </pre>
    </details>
  );
}
