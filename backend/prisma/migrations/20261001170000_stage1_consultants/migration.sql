-- CreateTable
CREATE TABLE "DesignCriterion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "raisedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DesignCriterion_projectId_idx" ON "DesignCriterion"("projectId");

-- AddForeignKey
ALTER TABLE "DesignCriterion" ADD CONSTRAINT "DesignCriterion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignCriterion" ADD CONSTRAINT "DesignCriterion_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Consultant permission defaults for the PROCSA consultant roles (added in
-- 20261001120000 with a copy of full access). Consultants see and comment
-- on everything; create/edit what they contribute (Stage 1 inputs,
-- documents, transmittals, RFIs, submittals, tasks, issues, risks,
-- meetings); review RFIs and submittals. They don't manage the team or
-- their own fees, run or award procurement, move the stage gate, delete
-- records, or approve Stage 1 documents. Admin-editable afterwards.
UPDATE "RolePermission"
SET "allowed" = CASE
  WHEN "action" IN ('VIEW', 'COMMENT') THEN true
  WHEN "action" IN ('CREATE', 'EDIT') AND "module" IN ('TASKS', 'ISSUES', 'RISKS', 'DOCUMENTS', 'TRANSMITTALS', 'RFIS', 'SUBMITTALS', 'PROJECT_DEFINITION', 'MEETINGS') THEN true
  WHEN "action" = 'APPROVE' AND "module" IN ('RFIS', 'SUBMITTALS') THEN true
  ELSE false
END
WHERE "role" IN ('ARCHITECT', 'STRUCTURAL_ENGINEER', 'CIVIL_ENGINEER', 'ELECTRICAL_ENGINEER', 'MECHANICAL_ENGINEER');
