-- CreateTable
CREATE TABLE "ScheduleProgressEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "percentComplete" INTEGER NOT NULL,
    "previousPercent" INTEGER NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleProgressEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleProgressEntry_activityId_date_idx" ON "ScheduleProgressEntry"("activityId", "date");

-- CreateIndex
CREATE INDEX "ScheduleProgressEntry_projectId_date_idx" ON "ScheduleProgressEntry"("projectId", "date");

-- AddForeignKey
ALTER TABLE "ScheduleProgressEntry" ADD CONSTRAINT "ScheduleProgressEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleProgressEntry" ADD CONSTRAINT "ScheduleProgressEntry_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ScheduleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleProgressEntry" ADD CONSTRAINT "ScheduleProgressEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

