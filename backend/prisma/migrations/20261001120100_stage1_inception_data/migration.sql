-- Default permissions for the new PROCSA consultant roles and the two new
-- modules, matching seed.ts's defaultAllowed(). A separate migration from
-- the one adding the enum values: Postgres can't use a new enum value in
-- the same transaction that added it. ON CONFLICT keeps any row an admin
-- already edited.
WITH
  full_roles(role) AS (
    VALUES ('DEVELOPMENT_MANAGER'), ('PROJECT_MANAGER'), ('PLANNER_SCHEDULER'), ('QUANTITY_SURVEYOR'),
           ('PROCUREMENT_MANAGER'), ('ARCHITECT_ENGINEER'), ('ARCHITECT'), ('STRUCTURAL_ENGINEER'),
           ('CIVIL_ENGINEER'), ('ELECTRICAL_ENGINEER'), ('MECHANICAL_ENGINEER'), ('SITE_MANAGER'),
           ('QA_QC_MANAGER'), ('HSE_MANAGER')
  ),
  all_roles(role) AS (
    SELECT role FROM full_roles UNION ALL VALUES ('CONTRACTOR'), ('CLIENT'), ('OTHER')
  ),
  modules(module) AS (
    SELECT unnest(enum_range(NULL::"PermissionModule"))::text
  ),
  actions(action) AS (
    SELECT unnest(enum_range(NULL::"PermissionAction"))::text
  )
INSERT INTO "RolePermission" ("id", "role", "module", "action", "allowed")
SELECT
  gen_random_uuid()::text,
  r.role::"ProjectMemberRole",
  m.module::"PermissionModule",
  a.action::"PermissionAction",
  CASE
    WHEN r.role IN (SELECT role FROM full_roles) THEN true
    WHEN a.action IN ('VIEW', 'COMMENT') THEN true
    WHEN r.role = 'CONTRACTOR' AND a.action IN ('CREATE', 'EDIT')
      AND m.module IN ('DOCUMENTS', 'RFIS', 'SUBMITTALS', 'TASKS', 'ISSUES', 'PROCUREMENT') THEN true
    WHEN r.role = 'CLIENT' AND a.action = 'APPROVE'
      AND m.module IN ('RFIS', 'SUBMITTALS', 'STAGE_GATE', 'PROJECT_DEFINITION') THEN true
    ELSE false
  END
FROM all_roles r CROSS JOIN modules m CROSS JOIN actions a
ON CONFLICT ("role", "module", "action") DO NOTHING;

-- Projects already converted from an opportunity: carry their Stage 0
-- authority approvals into the new consents schedule (PM 1.7).
INSERT INTO "ConsentApproval" ("id", "projectId", "title", "status", "approvedAt", "notes", "sourceApprovalId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  o."convertedProjectId",
  a."approvalType",
  CASE a."status"
    WHEN 'PENDING' THEN 'IN_PREPARATION'::"ConsentStatus"
    WHEN 'SUBMITTED' THEN 'SUBMITTED'::"ConsentStatus"
    WHEN 'APPROVED' THEN 'APPROVED'::"ConsentStatus"
    ELSE 'REJECTED'::"ConsentStatus"
  END,
  CASE WHEN a."status" = 'APPROVED' THEN a."updatedAt" END,
  a."evidenceNotes",
  a."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "OpportunityApproval" a
JOIN "Opportunity" o ON o."id" = a."opportunityId"
WHERE o."convertedProjectId" IS NOT NULL;

-- ...and the Stage 0 award record onto the project appointments it created.
UPDATE "OrganisationProjectAppointment" p
SET "rankAtAward" = oa."rankAtAward",
    "scoreAtAward" = oa."scoreAtAward",
    "awardJustification" = oa."justification"
FROM "OpportunityAppointment" oa
WHERE oa."projectAppointmentId" = p."id";
