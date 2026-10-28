-- AlterEnum
ALTER TYPE "LandAcquisitionStatus" ADD VALUE 'CLIENT_OWNED';

-- CreateTable
CREATE TABLE "SiteWeatherDay" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weatherCode" INTEGER,
    "tempMaxC" DOUBLE PRECISION,
    "tempMinC" DOUBLE PRECISION,
    "precipitationMm" DOUBLE PRECISION,
    "windMaxKmh" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteWeatherDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteWeatherDay_projectId_date_key" ON "SiteWeatherDay"("projectId", "date");

-- AddForeignKey
ALTER TABLE "SiteWeatherDay" ADD CONSTRAINT "SiteWeatherDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
