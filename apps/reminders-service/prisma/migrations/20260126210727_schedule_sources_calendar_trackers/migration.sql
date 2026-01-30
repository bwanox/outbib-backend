/*
  Warnings:

  - You are about to drop the `Reminder` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ScheduleSourceType" AS ENUM ('MEDICATION', 'APPOINTMENT', 'WATER_HABIT', 'NOTE');

-- CreateEnum
CREATE TYPE "ScheduleSourceStatus" AS ENUM ('ACTIVE', 'SNOOZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CalendarOccurrenceStatus" AS ENUM ('SCHEDULED', 'DONE', 'SKIPPED', 'MISSED', 'CANCELLED');

-- DropTable
DROP TABLE "Reminder";

-- DropEnum
DROP TYPE "ReminderStatus";

-- DropEnum
DROP TYPE "ReminderType";

-- CreateTable
CREATE TABLE "ScheduleSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ScheduleSourceType" NOT NULL,
    "status" "ScheduleSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "timezone" TEXT NOT NULL,
    "appointmentAt" TIMESTAMP(3),
    "location" TEXT,
    "dosageText" TEXT,
    "timesOfDay" JSONB,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "dailyGoalMl" INTEGER,
    "nudgeEnabled" BOOLEAN,
    "nudgeEveryMinutes" INTEGER,
    "activeHours" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "lastTriggeredAt" TIMESTAMP(3),
    "nextTriggerAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarOccurrence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "CalendarOccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "totalMl" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaterLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterLogEntry" (
    "id" TEXT NOT NULL,
    "waterLogId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "amountMl" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaterLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleSource_userId_idx" ON "ScheduleSource"("userId");

-- CreateIndex
CREATE INDEX "ScheduleSource_status_idx" ON "ScheduleSource"("status");

-- CreateIndex
CREATE INDEX "ScheduleSource_nextTriggerAt_idx" ON "ScheduleSource"("nextTriggerAt");

-- CreateIndex
CREATE INDEX "ScheduleSource_deletedAt_idx" ON "ScheduleSource"("deletedAt");

-- CreateIndex
CREATE INDEX "CalendarOccurrence_userId_scheduledAt_idx" ON "CalendarOccurrence"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "CalendarOccurrence_sourceId_scheduledAt_idx" ON "CalendarOccurrence"("sourceId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarOccurrence_sourceId_scheduledAt_key" ON "CalendarOccurrence"("sourceId", "scheduledAt");

-- CreateIndex
CREATE INDEX "WaterLog_userId_idx" ON "WaterLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WaterLog_userId_date_key" ON "WaterLog"("userId", "date");

-- CreateIndex
CREATE INDEX "WaterLogEntry_waterLogId_idx" ON "WaterLogEntry"("waterLogId");

-- CreateIndex
CREATE INDEX "WaterLogEntry_at_idx" ON "WaterLogEntry"("at");

-- AddForeignKey
ALTER TABLE "CalendarOccurrence" ADD CONSTRAINT "CalendarOccurrence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ScheduleSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterLogEntry" ADD CONSTRAINT "WaterLogEntry_waterLogId_fkey" FOREIGN KEY ("waterLogId") REFERENCES "WaterLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
