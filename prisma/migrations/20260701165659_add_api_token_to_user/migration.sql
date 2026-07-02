-- AlterTable: add apiToken to User
ALTER TABLE "User" ADD COLUMN "apiToken" TEXT;
CREATE UNIQUE INDEX "User_apiToken_key" ON "User"("apiToken");
