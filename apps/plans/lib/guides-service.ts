import { scopedDb } from "@elio/db";

export type GuideArticleInput = {
  title: string;
  slug: string;
  content: string;
  category?: string;
  sortOrder?: number;
  published?: boolean;
};

export async function listGuideArticles(practiceId: string, options?: { category?: string; publishedOnly?: boolean }) {
  const db = scopedDb(practiceId);
  return db.planGuideArticle.findMany({
    where: {
      ...(options?.category ? { category: options.category } : {}),
      ...(options?.publishedOnly !== false ? { published: true } : {}),
    },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
  });
}

export async function getGuideArticle(practiceId: string, id: string) {
  const db = scopedDb(practiceId);
  return db.planGuideArticle.findFirst({ where: { id } });
}

export async function createGuideArticle(practiceId: string, input: GuideArticleInput) {
  const db = scopedDb(practiceId);
  return db.planGuideArticle.create({
    data: {
      practiceId,
      title: input.title.trim(),
      slug: input.slug.trim(),
      content: input.content,
      category: input.category ?? "general",
      sortOrder: input.sortOrder ?? 0,
      published: input.published ?? true,
    },
  });
}

export async function updateGuideArticle(practiceId: string, id: string, input: Partial<GuideArticleInput>) {
  const db = scopedDb(practiceId);
  const existing = await db.planGuideArticle.findFirst({ where: { id } });
  if (!existing) throw new Error("Guide article not found");

  return db.planGuideArticle.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.slug !== undefined ? { slug: input.slug.trim() } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.published !== undefined ? { published: input.published } : {}),
    },
  });
}

export async function deleteGuideArticle(practiceId: string, id: string) {
  const db = scopedDb(practiceId);
  const existing = await db.planGuideArticle.findFirst({ where: { id } });
  if (!existing) throw new Error("Guide article not found");
  await db.planGuideArticle.delete({ where: { id } });
}

const DEFAULT_GUIDES: GuideArticleInput[] = [
  {
    title: "Getting Started with the System",
    slug: "getting-started",
    category: "getting-started",
    sortOrder: 0,
    content: `Welcome to your dental membership management system! Here's how to get started:

1. **Add Your Plans** — Go to Plans in the sidebar and create your membership plans with pricing and inclusions.

2. **Configure Dentally** — In Settings > Integrations (portal), connect Dentally to enable patient sync and search.

3. **Add Patients** — Use the Patients page to import from Dentally or add patients manually. Assign them to a plan.

4. **Set Up GoCardless** — GoCardless credentials are configured via environment variables; collection days are in Settings.

5. **Send Invites** — Once patients are added, send them an invite to complete their signup and set up Direct Debit.

6. **Track Everything** — Use Reports and the Dashboard to monitor memberships, payments, and redeems.`,
  },
  {
    title: "Patient Signup Process",
    slug: "patient-signup-process",
    category: "patients",
    sortOrder: 0,
    content: `The patient signup journey works as follows:

**Step 1: Add the Patient**
Import from Dentally or add manually. Choose their plan.

**Step 2: Send an Invite**
Click "Send Invite" to email the patient a unique signup link.

**Step 3: Patient Reviews & Signs**
The patient follows the link, reviews the plan details, terms & conditions, and signs digitally.

**Step 4: Direct Debit Setup**
After signing, the patient is redirected to GoCardless to set up their Direct Debit mandate.

**Step 5: Active Membership**
Once the mandate is confirmed, the patient's status changes to ACTIVE and monthly collections begin.`,
  },
  {
    title: "How Redeems Work",
    slug: "how-redeems-work",
    category: "redeems",
    sortOrder: 0,
    content: `Redeems track when patients use their plan benefits (e.g., exams, hygiene appointments, discounts).

**Creating a Redeem:**
Create redeems from completed Dentally appointments (P4.6) or approve pending requests on the Redeems page.

**Approving Redeems:**
Go to Action Required or the Redeems section to approve or reject pending redeems.

**Why Track Redeems?**
- Which patients are using their benefits
- Breakage rate in Reports
- Plan profitability`,
  },
  {
    title: "Payments & Direct Debit",
    slug: "payments-direct-debit",
    category: "payments",
    sortOrder: 0,
    content: `Payments are collected automatically via GoCardless Direct Debit.

**Collection Schedule:**
- Monthly collections on the 1st (configurable in Settings)
- Retry on the 11th if the first attempt fails

**Payment Statuses:** PENDING, CONFIRMED, PAID_OUT, FAILED, CHARGED_BACK

View the full payment trail on each patient's profile page.`,
  },
  {
    title: "Syncing Patients from Dentally",
    slug: "syncing-from-dentally",
    category: "patients",
    sortOrder: 1,
    content: `Use **Sync from Dentally** on the Patients page or the Dentally mappings screen.

**Requirements:**
- Dentally API key configured in portal Integrations
- Payment plan mappings on the Dentally page

**What Gets Synced:** name, email, phone, Dentally patient ID, plan assignment via mappings.`,
  },
  {
    title: "Understanding Reports",
    slug: "understanding-reports",
    category: "reports",
    sortOrder: 0,
    content: `The Reports page provides analytics for your membership plans.

**Tabs:** Overview, Revenue, Redeems, Breakage

**Breakage:** percentage of active patients not using benefits — higher breakage means more retained revenue from unused inclusions.

Owners can export report data as CSV.`,
  },
];

/** Seed default guide articles when none exist (P4.5). */
export async function seedDefaultGuides(practiceId: string) {
  const db = scopedDb(practiceId);
  const count = await db.planGuideArticle.count();
  if (count > 0) return { created: 0, existing: count };

  await db.planGuideArticle.createMany({
    data: DEFAULT_GUIDES.map((g) => ({
      practiceId,
      title: g.title,
      slug: g.slug,
      content: g.content,
      category: g.category,
      sortOrder: g.sortOrder,
      published: true,
    })),
  });

  return { created: DEFAULT_GUIDES.length, existing: 0 };
}
