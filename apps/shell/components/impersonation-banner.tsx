"use client";

import { motion } from "framer-motion";

interface Props {
  impersonatedUserEmail: string;
}

/**
 * APPLICATION_FLOW.md §11a: "the UI must show an unmissable persistent
 * banner ... for the entire duration, so there's no ambiguity about whose
 * session this is." Deliberately NOT dismissible except via the real "End"
 * action (which actually ends the ImpersonationSession server-side, then
 * redirects) — closing/hiding this without ending the session would defeat
 * its purpose. A plain form POST, no client JS needed for the action itself.
 */
export function ImpersonationBanner({ impersonatedUserEmail }: Props) {
  return (
    <motion.div
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-[1300] flex items-center justify-center gap-3 bg-[--color-warning] px-4 py-2 text-body-sm font-medium text-white"
      data-testid="impersonation-banner"
    >
      <span>
        Viewing as <strong>{impersonatedUserEmail}</strong> — Impersonation active
      </span>
      <form action="/api/impersonate/end" method="POST">
        <button
          type="submit"
          className="rounded-[--radius-sm] border border-white/40 px-2.5 py-0.5 text-caption font-semibold hover:bg-white/10"
          data-testid="impersonation-end"
        >
          End
        </button>
      </form>
    </motion.div>
  );
}
