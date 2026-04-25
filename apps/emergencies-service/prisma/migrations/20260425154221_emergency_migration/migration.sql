-- CreateEnum
CREATE TYPE "EmergencyStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Type" AS ENUM ('CARDIOLOGY', 'NEUROLOGY', 'TRAUMA', 'ORTHOPEDIC', 'RESPIRATORY', 'PEDIATRIC', 'OBSTETRIC', 'TOXICOLOGY', 'BURNS', 'GENERAL');

-- CreateTable
CREATE TABLE "Emergency" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "Type" NOT NULL,
    "status" "EmergencyStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "message" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Emergency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Emergency_userId_idx" ON "Emergency"("userId");

-- CreateIndex
CREATE INDEX "Emergency_status_idx" ON "Emergency"("status");

-- CreateIndex
CREATE INDEX "Emergency_triggeredAt_idx" ON "Emergency"("triggeredAt");
