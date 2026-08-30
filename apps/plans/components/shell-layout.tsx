"use client";

import { ModuleAppLayout, PLANS_MODULE_NAV } from "@elio/ui";

export interface ShellLayoutProps {
  userEmail?: string;
  children: React.ReactNode;
}

/** ElioPlans app chrome — page tabs in sidebar, ELIO Portal back link only. */
export function ShellLayout({ userEmail, children }: ShellLayoutProps) {
  return (
    <ModuleAppLayout brandTitle="ELIO PLANS" moduleId="plans" navItems={PLANS_MODULE_NAV} userEmail={userEmail}>
      {children}
    </ModuleAppLayout>
  );
}
