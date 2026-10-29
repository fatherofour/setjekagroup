-- The consultant who reviews a contract's valuations (architect or engineer).
ALTER TABLE "ProjectContract" ADD COLUMN "reviewerRole" "ProjectMemberRole" NOT NULL DEFAULT 'ARCHITECT';
