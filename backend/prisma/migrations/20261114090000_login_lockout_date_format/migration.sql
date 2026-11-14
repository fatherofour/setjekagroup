-- Login lockout (critique M-03) and each person's date format (M-07).
ALTER TABLE "User" ADD COLUMN "failedLogins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY';
