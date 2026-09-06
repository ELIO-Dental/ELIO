"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, toast } from "@elio/ui";

export function TenantUserActions({
  practiceId,
  userId,
  email,
}: {
  practiceId: string;
  userId: string;
  email: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"reset" | "reinvite" | null>(null);

  async function send(mode: "reset" | "reinvite") {
    setPending(mode);
    const res = await fetch(`/api/tenants/${practiceId}/users/${userId}/password-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    setPending(null);
    if (!res.ok) {
      toast.error(mode === "reinvite" ? "Failed to re-invite user." : "Failed to send password reset.");
      return;
    }
    toast.success(
      mode === "reinvite" ? `Re-invite sent to ${email}.` : `Password reset sent to ${email}.`
    );
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending === "reset"}
        disabled={pending !== null}
        onClick={() => send("reset")}
        data-testid={`password-reset-${userId}`}
      >
        Send password reset
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={pending === "reinvite"}
        disabled={pending !== null}
        onClick={() => send("reinvite")}
        data-testid={`reinvite-${userId}`}
      >
        Re-invite
      </Button>
    </div>
  );
}
