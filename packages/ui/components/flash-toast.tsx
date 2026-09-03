"use client";

import * as React from "react";
import { toast } from "./toast";

const KEY = "elio-flash-toast";

type FlashKind = "success" | "error" | "info" | "warning";

type FlashPayload = {
  kind: FlashKind;
  title: string;
  description?: string;
};

/** Persist a toast across a full page navigation (login success → launcher). */
export function queueFlashToast(kind: FlashKind, title: string, description?: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ kind, title, description } satisfies FlashPayload));
  } catch {
    /* private mode / storage blocked */
  }
}

export function FlashQueuedToasts() {
  React.useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(KEY);
      if (raw) sessionStorage.removeItem(KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as FlashPayload;
      const opts = payload.description ? { description: payload.description } : undefined;
      if (payload.kind === "success") toast.success(payload.title, opts);
      else if (payload.kind === "error") toast.error(payload.title, opts);
      else if (payload.kind === "warning") toast.warning(payload.title, opts);
      else toast.info(payload.title, opts);
    } catch {
      /* ignore malformed */
    }
  }, []);
  return null;
}
