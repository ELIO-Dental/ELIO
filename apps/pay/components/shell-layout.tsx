"use client";

import { ModuleAppLayout, PAY_MODULE_NAV } from "@elio/ui";

export interface ShellLayoutProps {
  userEmail?: string;
  isOwner?: boolean;
  children: React.ReactNode;
}

/** ElioPay app chrome — page tabs in sidebar, ELIO Portal back link only. */
export function ShellLayout({ userEmail, isOwner, children }: ShellLayoutProps) {
  const navItems = isOwner ? PAY_MODULE_NAV : PAY_MODULE_NAV.filter((item) => item.id !== "settings");

  return (
    <ModuleAppLayout brandTitle="ELIO PAY" moduleId="pay" navItems={navItems} userEmail={userEmail}>
      {children}
    </ModuleAppLayout>
  );
}
