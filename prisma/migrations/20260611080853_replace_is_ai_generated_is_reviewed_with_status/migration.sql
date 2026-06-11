/*
  Warnings:

  - You are about to drop the column `isAIGenerated` on the `WikiEntry` table. All the data in the column will be lost.
  - You are about to drop the column `isReviewed` on the `WikiEntry` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "WikiStatus" AS ENUM ('proposed', 'creating', 'unreviewed', 'reviewed');

-- AlterTable
ALTER TABLE "WikiEntry" DROP COLUMN "isAIGenerated",
DROP COLUMN "isReviewed",
ADD COLUMN     "status" "WikiStatus" NOT NULL DEFAULT 'proposed';
