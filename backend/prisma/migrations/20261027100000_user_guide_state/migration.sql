-- The in-app guide: which tours and screen tips each person has seen.
ALTER TABLE "User" ADD COLUMN "guideState" JSONB NOT NULL DEFAULT '{}';
