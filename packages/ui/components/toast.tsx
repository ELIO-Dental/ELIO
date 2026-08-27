"use client";

import * as React from "react";
import { Toaster as SonnerToaster, toast } from "sonner";

/** §5.8 — Sonner-based toast, themed to ELIO tokens. Mount once in the shell layout. */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      mobileOffset={16}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast:
            "rounded-(--radius-lg)! border! border-(--color-border-subtle)! bg-(--color-surface-raised)! shadow-(--shadow-md)! text-(--color-text-primary)! font-(--font-sans)!",
          title: "text-body-sm! font-medium!",
          description: "text-caption! text-(--color-text-secondary)!",
          success: "border-l-4! border-l-(--color-success)!",
          error: "border-l-4! border-l-(--color-danger)!",
          warning: "border-l-4! border-l-(--color-warning)!",
          info: "border-l-4! border-l-(--color-info)!",
        },
      }}
      // Errors get manual dismiss + a longer floor per §5.8 — callers pass duration:Infinity or 8000 explicitly.
    />
  );
}

export { toast };
