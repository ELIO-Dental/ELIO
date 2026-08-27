-- CreateTable
CREATE TABLE "flow_legacy_touch_point_archive" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "sourcePatientId" TEXT NOT NULL,
    "touchPoints" INTEGER NOT NULL,
    "rawRowJson" TEXT NOT NULL,
    "migratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flow_legacy_touch_point_archive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flow_legacy_touch_point_archive_practiceId_idx" ON "flow_legacy_touch_point_archive"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "flow_legacy_touch_point_archive_practiceId_sourcePatientId_key" ON "flow_legacy_touch_point_archive"("practiceId", "sourcePatientId");

-- AddForeignKey
ALTER TABLE "flow_legacy_touch_point_archive" ADD CONSTRAINT "flow_legacy_touch_point_archive_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
