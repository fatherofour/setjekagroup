-- The QS (2026-10-28): consultant permissions, plus creating and editing
-- commercial and procurement records (bills, valuations, tenders) and
-- deleting commercial drafts. Approving stays with the client and Setjeka.
-- Matches defaultAllowed() in seed.ts.
UPDATE "RolePermission" SET "allowed" = CASE
  WHEN "action" IN ('VIEW', 'COMMENT') THEN TRUE
  WHEN "module" = 'COMMERCIAL' THEN "action" <> 'APPROVE'
  WHEN "module" = 'SITE_PHOTOS' THEN "action" <> 'APPROVE'
  WHEN "module" = 'COMMUNICATIONS' THEN "action" NOT IN ('APPROVE', 'DELETE')
  WHEN "module" = 'INSPECTIONS' THEN "action" NOT IN ('APPROVE', 'DELETE')
  WHEN "action" IN ('CREATE', 'EDIT') THEN "module" IN ('TASKS', 'ISSUES', 'RISKS', 'DOCUMENTS', 'TRANSMITTALS', 'RFIS', 'SUBMITTALS', 'PROJECT_DEFINITION', 'MEETINGS', 'PROCUREMENT')
  WHEN "action" = 'APPROVE' THEN "module" IN ('RFIS', 'SUBMITTALS')
  ELSE FALSE
END
WHERE "role" = 'QUANTITY_SURVEYOR';
