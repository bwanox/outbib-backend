-- CreateEnum
CREATE TYPE "PharmacySource" AS ENUM ('GOOGLE_MAPS', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Pharmacy" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "rating" DOUBLE PRECISION,
    "ratingsCount" INTEGER,
    "openingHoursJson" JSONB,
    "isOpenNow" BOOLEAN,
    "types" TEXT[],
    "source" "PharmacySource" NOT NULL DEFAULT 'GOOGLE_MAPS',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pharmacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyReview" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "authorName" TEXT,
    "rating" DOUBLE PRECISION,
    "text" TEXT,
    "relativeTimeDescription" TEXT,
    "time" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "fetchedCount" INTEGER,
    "upsertedCount" INTEGER,
    "errorsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pharmacy_placeId_key" ON "Pharmacy"("placeId");

-- CreateIndex
CREATE INDEX "Pharmacy_city_idx" ON "Pharmacy"("city");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyReview_pharmacyId_authorName_time_key" ON "PharmacyReview"("pharmacyId", "authorName", "time");

-- CreateIndex
CREATE INDEX "SyncJob_city_idx" ON "SyncJob"("city");

-- AddForeignKey
ALTER TABLE "PharmacyReview" ADD CONSTRAINT "PharmacyReview_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
