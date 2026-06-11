-- Add unique constraint on (name, language) for WikiEntry
CREATE UNIQUE INDEX "WikiEntry_name_language_key" ON "WikiEntry"("name", "language");
