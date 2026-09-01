-- P4.5: guide article slugs are unique per practice, not globally
DROP INDEX IF EXISTS "plans_guide_articles_slug_key";
CREATE UNIQUE INDEX "plans_guide_articles_practiceId_slug_key" ON "plans_guide_articles"("practiceId", "slug");
