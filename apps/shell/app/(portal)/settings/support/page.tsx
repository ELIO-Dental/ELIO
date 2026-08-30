import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, PageContent, PageHeader } from "@elio/ui";
import { BookOpen, Mail, MessageCircle, Shield } from "lucide-react";

const SUPPORT_EMAIL = "support@elioportal.co.uk";

export default function SupportSettingsPage() {
  return (
    <PageContent width="md">
      <PageHeader title="Support" description="Get help with ELIO Portal and your practice modules." />

      <div className="mt-8 space-y-6">
        <Card className="border-(--color-border-subtle) shadow-(--shadow-sm)">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-5 text-(--color-primary-500)" aria-hidden />
              Contact us
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-body-sm leading-relaxed text-(--color-text-secondary)">
            <p>
              Email our support team and we&apos;ll get back to you within one business day. Include your practice name and a short
              description of the issue.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=ELIO%20Portal%20support`}
              className="inline-flex font-medium text-(--color-primary-600) hover:underline"
              data-testid="support-email-link"
            >
              {SUPPORT_EMAIL}
            </a>
          </CardContent>
        </Card>

        <Card className="border-(--color-border-subtle) shadow-(--shadow-sm)">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-5 text-(--color-primary-500)" aria-hidden />
              Quick answers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-body-sm text-(--color-text-secondary)">
            <div>
              <p className="font-medium text-(--color-text-primary)">Forgot your password?</p>
              <p className="mt-1">
                Use{" "}
                <Link href="/forgot-password" className="text-(--color-primary-600) hover:underline">
                  reset password
                </Link>{" "}
                on the sign-in screen, or update it from your{" "}
                <Link href="/settings/profile" className="text-(--color-primary-600) hover:underline">
                  profile
                </Link>{" "}
                while signed in.
              </p>
            </div>
            <div>
              <p className="font-medium text-(--color-text-primary)">Need access for a colleague?</p>
              <p className="mt-1">
                Practice owners can invite team members from{" "}
                <Link href="/settings/team" className="text-(--color-primary-600) hover:underline">
                  Team settings
                </Link>
                .
              </p>
            </div>
            <div>
              <p className="font-medium text-(--color-text-primary)">Module not showing?</p>
              <p className="mt-1">Check the launcher dashboard — only licensed modules appear for your practice. Contact support if you expect access.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-(--color-border-subtle) shadow-(--shadow-sm)">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="size-5 text-(--color-primary-500)" aria-hidden />
              Coming soon
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-body-sm leading-relaxed text-(--color-text-secondary)">
            <p>We&apos;re building in-app help guides, live chat during UK business hours, and a searchable knowledge base for ElioPay, ElioPlans, and ElioFlow.</p>
            <p className="flex items-start gap-2">
              <Shield className="mt-0.5 size-4 shrink-0 text-(--color-text-tertiary)" aria-hidden />
              For urgent billing or data issues, mention &ldquo;urgent&rdquo; in your email subject so we can prioritise your request.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageContent>
  );
}
