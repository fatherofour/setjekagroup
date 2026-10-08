-- SITE_PHOTOS permission defaults. A separate migration because Postgres
-- can't use the new enum value in the transaction that added it.
--   Setjeka delivery roles: everything (there is nothing to approve).
--   Consultants and contractors: view, comment, add and edit - the service
--     limits outside parties to editing and deleting their own photos.
--   CLIENT and OTHER: view and comment. A client only ever sees the photos
--     Setjeka has shared (enforced in SitePhotosService).
INSERT INTO "RolePermission" ("id", "role", "module", "action", "allowed")
SELECT
  gen_random_uuid()::text,
  r.role::"ProjectMemberRole",
  'SITE_PHOTOS'::"PermissionModule",
  a.action::"PermissionAction",
  CASE
    WHEN r.role IN ('DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'PLANNER_SCHEDULER', 'QUANTITY_SURVEYOR',
                    'PROCUREMENT_MANAGER', 'ARCHITECT_ENGINEER', 'SITE_MANAGER', 'QA_QC_MANAGER', 'HSE_MANAGER')
      THEN a.action <> 'APPROVE'
    WHEN r.role IN ('ARCHITECT', 'STRUCTURAL_ENGINEER', 'CIVIL_ENGINEER', 'ELECTRICAL_ENGINEER',
                    'MECHANICAL_ENGINEER', 'CONTRACTOR')
      THEN a.action IN ('VIEW', 'COMMENT', 'CREATE', 'EDIT', 'DELETE')
    ELSE a.action IN ('VIEW', 'COMMENT')
  END
FROM unnest(enum_range(NULL::"ProjectMemberRole")) AS r(role)
CROSS JOIN unnest(ARRAY['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'COMMENT']) AS a(action)
ON CONFLICT ("role", "module", "action") DO NOTHING;
