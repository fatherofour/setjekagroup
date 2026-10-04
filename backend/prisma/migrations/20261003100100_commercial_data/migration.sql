-- COMMERCIAL permission defaults. A separate migration because Postgres
-- can't use the new enum value in the transaction that added it.
--   Setjeka delivery roles (incl. QS): everything except APPROVE.
--   CLIENT: view, comment and APPROVE - variations are the client's
--           decision alone (Meeting 3 hard rule).
--   Consultants, contractors, other: nothing - budgets and fees stay
--   with Setjeka and the client.
INSERT INTO "RolePermission" ("id", "role", "module", "action", "allowed")
SELECT
  gen_random_uuid()::text,
  r.role::"ProjectMemberRole",
  'COMMERCIAL'::"PermissionModule",
  a.action::"PermissionAction",
  CASE
    WHEN r.role IN ('DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'PLANNER_SCHEDULER', 'QUANTITY_SURVEYOR',
                    'PROCUREMENT_MANAGER', 'ARCHITECT_ENGINEER', 'SITE_MANAGER', 'QA_QC_MANAGER', 'HSE_MANAGER')
      THEN a.action <> 'APPROVE'
    WHEN r.role = 'CLIENT' THEN a.action IN ('VIEW', 'COMMENT', 'APPROVE')
    ELSE false
  END
FROM unnest(enum_range(NULL::"ProjectMemberRole")) AS r(role)
CROSS JOIN unnest(ARRAY['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'COMMENT']) AS a(action)
ON CONFLICT ("role", "module", "action") DO NOTHING;

-- Starter standard cost codes (works, consultants, procurement and
-- overheads). Editable; contingency is held separately on the budget.
INSERT INTO "CostCode" ("id", "code", "name", "category", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid()::text, '01', 'Preliminaries & general', 'WORKS', 10, now()),
  (gen_random_uuid()::text, '02', 'Site clearance & earthworks', 'WORKS', 20, now()),
  (gen_random_uuid()::text, '03', 'Substructure', 'WORKS', 30, now()),
  (gen_random_uuid()::text, '04', 'Concrete frame & slabs', 'WORKS', 40, now()),
  (gen_random_uuid()::text, '05', 'Masonry & walling', 'WORKS', 50, now()),
  (gen_random_uuid()::text, '06', 'Roofing', 'WORKS', 60, now()),
  (gen_random_uuid()::text, '07', 'Doors & windows', 'WORKS', 70, now()),
  (gen_random_uuid()::text, '08', 'Finishes', 'WORKS', 80, now()),
  (gen_random_uuid()::text, '09', 'Plumbing & drainage', 'WORKS', 90, now()),
  (gen_random_uuid()::text, '10', 'Electrical installation', 'WORKS', 100, now()),
  (gen_random_uuid()::text, '11', 'Mechanical installation', 'WORKS', 110, now()),
  (gen_random_uuid()::text, '12', 'External works', 'WORKS', 120, now()),
  (gen_random_uuid()::text, '13', 'Provisional sums', 'WORKS', 130, now()),
  (gen_random_uuid()::text, '20', 'Professional fees', 'CONSULTANTS', 200, now()),
  (gen_random_uuid()::text, '30', 'Owner-supplied materials & equipment', 'PROCUREMENT', 300, now()),
  (gen_random_uuid()::text, '40', 'Statutory fees & approvals', 'OVERHEADS', 400, now()),
  (gen_random_uuid()::text, '41', 'Development overheads', 'OVERHEADS', 410, now()),
  (gen_random_uuid()::text, '42', 'Finance costs', 'OVERHEADS', 420, now())
ON CONFLICT ("code") DO NOTHING;
