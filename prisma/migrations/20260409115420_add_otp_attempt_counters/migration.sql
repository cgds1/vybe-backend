-- AlterTable
ALTER TABLE "users" ADD COLUMN     "resetAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verifyAttempts" INTEGER NOT NULL DEFAULT 0;
