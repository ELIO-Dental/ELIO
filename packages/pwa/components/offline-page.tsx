"use client";

import * as React from "react";

export function OfflinePage({ appName }: { appName: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-(--radius-lg) bg-(--color-primary-50) text-(--color-primary-600)">
        <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M12 20h.01" strokeLinecap="round" />
          <path d="M8.5 8.5a3.5 3.5 0 0 1 5 0c0 2-1.5 2.5-2 4" strokeLinecap="round" />
          <path d="M12 16v.01" strokeLinecap="round" />
          <path d="M2 8.5C5.5 4 18.5 4 22 8.5" strokeLinecap="round" />
          <path d="M5 12.5C7 10 17 10 19 12.5" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="mt-6 text-h2 text-(--color-text-primary)">You&apos;re offline</h1>
      <p className="mt-2 max-w-md text-body text-(--color-text-secondary)">
        {appName} needs an internet connection. Reconnect, then reload to continue.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-8 inline-flex h-10 items-center justify-center rounded-(--radius-md) bg-(--color-primary-600) px-4 text-body font-medium text-white shadow-(--shadow-xs) transition-colors hover:bg-(--color-primary-700)"
      >
        Try again
      </button>
    </div>
  );
}
