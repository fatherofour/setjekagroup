-- Meeting 3 hard rule: the client alone approves Stage 1 documents. The
-- Development Manager previously held APPROVE here "acting for" the client.
UPDATE "RolePermission" SET "allowed" = false
WHERE "module" = 'PROJECT_DEFINITION' AND "action" = 'APPROVE' AND "role" <> 'CLIENT';
