import { prisma } from "@elio/db";
import { Building2, Link2, UserCircle } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle, PageContent, PageHeader } from "@elio/ui";
import { requireSession, redirectToLogin } from "@/lib/session";

/** Old ElioFlow Clinics + Account shortcuts — single practice in ELIO; no separate Flow login. */
export default async function PracticePage() {
  const session = await requireSession();
  if (!session) return redirectToLogin();

  const practice = await prisma.practice.findUnique({
    where: { id: session.practiceId },
    select: {
      id: true,
      name: true,
      dentists: { select: { id: true, name: true }, orderBy: { name: "asc" }, take: 50 },
      _count: { select: { dentists: true, users: true, patients: true } },
    },
  });

  return (
    <PageContent width="md">
      <PageHeader
        title="Practice"
        description="Your clinic for Flow (replaces classic ElioFlow Clinics in the one-practice ELIO portal). Dentally keys and profile live in Portal — not a second login."
      />

      <div className="mt-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-(--color-brand)" />
              {practice?.name ?? "Practice"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-body-sm text-(--color-text-secondary)">
            <p>
              <span className="text-(--color-text-tertiary)">Dentists:</span> {practice?._count.dentists ?? 0}
            </p>
            <p>
              <span className="text-(--color-text-tertiary)">Team users:</span> {practice?._count.users ?? 0}
            </p>
            <p>
              <span className="text-(--color-text-tertiary)">Patients synced:</span> {practice?._count.patients ?? 0}
            </p>
            {practice?.dentists?.length ? (
              <div className="pt-2">
                <p className="mb-2 text-caption font-medium text-(--color-text-primary)">Practitioners</p>
                <ul className="flex flex-wrap gap-2">
                  {practice.dentists.map((d) => (
                    <li
                      key={d.id}
                      className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-bg-subtle) px-3 py-1 text-caption"
                    >
                      {d.name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Portal shortcuts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <a href="/settings/integrations" className="inline-flex items-center gap-2">
                <Link2 className="size-4" />
                Dentally / Integrations
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href="/settings/profile" className="inline-flex items-center gap-2">
                <UserCircle className="size-4" />
                My account
              </a>
            </Button>
            <Button asChild variant="secondary">
              <a href="/settings/team">Manage team invites</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageContent>
  );
}
