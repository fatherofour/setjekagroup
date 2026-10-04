-- PROCSA PM 1.9: Stage 1 documentation is approved by the client (and the
-- Development Manager acting for them) — not by the consultants who wrote
-- it, even though they otherwise hold full access. Admin-editable afterwards
-- in the permission matrix.
UPDATE "RolePermission"
SET "allowed" = false
WHERE "module" = 'PROJECT_DEFINITION'
  AND "action" = 'APPROVE'
  AND "role" NOT IN ('CLIENT', 'DEVELOPMENT_MANAGER');
