"use client";

import * as React from "react";
import { ConfirmDialog } from "@elio/ui";

/**
 * The form still does a plain POST + 303 redirect handoff into the Flow
 * shell (see app/api/tenants/[id]/impersonate/[userId]/route.ts) — this
 * only adds a confirmation gate in front of `form.requestSubmit()`, which
 * preserves that native submit/redirect behavior rather than intercepting
 * it with fetch.
 */
export function ImpersonateButton({ action, userId, email }: { action: string; userId: string; email: string }) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={action} method="POST">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="text-body-sm font-medium text-(--color-primary-fg) hover:text-(--color-primary-fg-muted) hover:underline"
          data-testid={`impersonate-${userId}`}
        >
          Impersonate
        </button>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Impersonate ${email}?`}
        description="This signs you in as this user for support purposes. Their account will show your session as active."
        confirmLabel="Impersonate"
        variant="destructive"
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
      />
    </>
  );
}
