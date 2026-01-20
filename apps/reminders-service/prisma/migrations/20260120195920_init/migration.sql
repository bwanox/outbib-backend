-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('MEDICATION', 'APPOINTMENT');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('ACTIVE', 'SNOOZED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReminderType" NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "timezone" TEXT NOT NULL,
    "appointmentAt" TIMESTAMP(3),
    "location" TEXT,
    "dosageText" TEXT,
    "timesOfDay" JSONB,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "lastTriggeredAt" TIMESTAMP(3),
    "nextTriggerAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_userId_idx" ON "Reminder"("userId");

-- CreateIndex
CREATE INDEX "Reminder_status_idx" ON "Reminder"("status");

-- CreateIndex
CREATE INDEX "Reminder_nextTriggerAt_idx" ON "Reminder"("nextTriggerAt");

-- CreateIndex
CREATE INDEX "Reminder_deletedAt_idx" ON "Reminder"("deletedAt");
