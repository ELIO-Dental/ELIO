import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, PageContent, PageHeader, AppearanceSettings, Button } from "@elio/ui";
import { PwaSettingsSection, getPwaConfig } from "@elio/pwa";

const pwa = getPwaConfig("portal");

export default function SettingsPage() {
  return (
    <PageContent width="md">
      <PageHeader title="Settings" description="Configure your ELIO Portal preferences. Appearance applies across every ELIO module." />

      <Card className="mt-8 border-(--color-border-subtle) shadow-(--shadow-sm)">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Integrations</CardTitle>
            <p className="mt-1 text-body-sm text-(--color-text-secondary)">Dentally sync, connection status, and manual sync.</p>
          </div>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/settings/integrations">Open</Link>
          </Button>
        </CardHeader>
      </Card>

      <Card className="mt-8 border-(--color-border-subtle) shadow-(--shadow-sm)">
        <CardHeader>
          <CardTitle>Install app</CardTitle>
        </CardHeader>
        <CardContent>
          <PwaSettingsSection config={pwa} />
        </CardContent>
      </Card>

      <Card className="mt-8 border-(--color-border-subtle) shadow-(--shadow-sm)">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-5 text-body-sm text-(--color-text-secondary)">
            Choose light, dark, or match your device. Your choice is remembered on this browser for the portal and all module dashboards.
          </p>
          <AppearanceSettings />
        </CardContent>
      </Card>
    </PageContent>
  );
}
