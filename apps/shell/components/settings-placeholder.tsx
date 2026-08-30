"use client";

import { Construction } from "lucide-react";
import { Card, CardContent, EmptyState, PageContent, PageHeader } from "@elio/ui";

export function SettingsPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <PageContent width="md">
      <PageHeader title={title} description={description} />
      <Card className="mt-8 border-(--color-border-subtle) shadow-(--shadow-sm)">
        <CardContent className="p-2">
          <EmptyState
            icon={Construction}
            title="Coming soon"
            description="This section is being prepared. Your practice data and integrations are unaffected."
            className="border-none bg-transparent py-12"
          />
        </CardContent>
      </Card>
    </PageContent>
  );
}
