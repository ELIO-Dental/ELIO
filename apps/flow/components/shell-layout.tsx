"use client";

import { ModuleAppLayout, FLOW_MODULE_NAV } from "@elio/ui";

export interface ShellLayoutProps {
  userEmail?: string;
  children: React.ReactNode;
}

/** ElioFlow app chrome — page tabs in sidebar, ELIO Portal back link only. */
export function ShellLayout({ userEmail, children }: ShellLayoutProps) {
  return (
    <ModuleAppLayout
      brandTitle="ELIO FLOW"
      moduleId="flow"
      navItems={FLOW_MODULE_NAV}
      userEmail={userEmail}
      resolveActiveId={(pathname, defaultId) => (pathname.startsWith("/flow/consults") ? "pipeline" : defaultId)}
    >
      {children}
    </ModuleAppLayout>
  );
}
