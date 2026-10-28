-- COMMUNICATIONS and INSPECTIONS permission defaults, and starter
-- inspection checklists. A separate migration because Postgres can't use the
-- new enum values in the transaction that added them.
--
-- COMMUNICATIONS: everyone on a project can read and write what is addressed
--   to them; CommunicationsService enforces the routing (outside parties write
--   to Setjeka only, and only Setjeka issues). APPROVE is "issue", for
--   Setjeka's delivery roles. Nothing is deleted - it is cancelled instead.
-- INSPECTIONS: Setjeka's delivery roles do everything; consultants request,
--   carry out and record inspections; contractors request them; the client
--   sees none by default.
INSERT INTO "RolePermission" ("id", "role", "module", "action", "allowed")
SELECT
  gen_random_uuid()::text,
  r.role::"ProjectMemberRole",
  m.module::"PermissionModule",
  a.action::"PermissionAction",
  CASE
    WHEN m.module = 'COMMUNICATIONS' THEN
      CASE
        WHEN a.action = 'DELETE' THEN false
        WHEN r.role IN ('DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'PLANNER_SCHEDULER', 'QUANTITY_SURVEYOR',
                        'PROCUREMENT_MANAGER', 'ARCHITECT_ENGINEER', 'SITE_MANAGER', 'QA_QC_MANAGER', 'HSE_MANAGER')
          THEN true
        WHEN r.role = 'OTHER' THEN a.action IN ('VIEW', 'COMMENT')
        ELSE a.action IN ('VIEW', 'COMMENT', 'CREATE', 'EDIT')
      END
    ELSE
      CASE
        WHEN a.action = 'APPROVE' THEN false
        WHEN r.role IN ('DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'PLANNER_SCHEDULER', 'QUANTITY_SURVEYOR',
                        'PROCUREMENT_MANAGER', 'ARCHITECT_ENGINEER', 'SITE_MANAGER', 'QA_QC_MANAGER', 'HSE_MANAGER')
          THEN true
        WHEN r.role IN ('ARCHITECT', 'STRUCTURAL_ENGINEER', 'CIVIL_ENGINEER', 'ELECTRICAL_ENGINEER', 'MECHANICAL_ENGINEER')
          THEN a.action IN ('VIEW', 'COMMENT', 'CREATE', 'EDIT')
        WHEN r.role = 'CONTRACTOR' THEN a.action IN ('VIEW', 'COMMENT', 'CREATE')
        WHEN r.role = 'OTHER' THEN a.action IN ('VIEW', 'COMMENT')
        ELSE false
      END
  END
FROM unnest(enum_range(NULL::"ProjectMemberRole")) AS r(role)
CROSS JOIN unnest(ARRAY['COMMUNICATIONS', 'INSPECTIONS']) AS m(module)
CROSS JOIN unnest(ARRAY['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'COMMENT']) AS a(action)
ON CONFLICT ("role", "module", "action") DO NOTHING;

-- Starter checklists. Setjeka edits these and adds its own.
INSERT INTO "InspectionTemplate" ("id", "name", "workType", "kind", "items", "updatedAt") VALUES
(gen_random_uuid()::text, 'Concrete - pre-pour inspection', 'Concrete', 'QUALITY', ARRAY[
  'Formwork true to line, level and dimensions',
  'Formwork clean and release agent applied',
  'Reinforcement size, spacing and laps to the engineer''s drawings',
  'Cover spacers in place',
  'Starter bars and cast-in items positioned',
  'Service sleeves and conduits in place',
  'Construction joints prepared',
  'Mix and strength confirmed with the supplier',
  'Cube samples arranged',
  'Engineer''s approval to pour obtained'
], now()),
(gen_random_uuid()::text, 'Masonry', 'Masonry', 'QUALITY', ARRAY[
  'Bricks or blocks as specified (sample approved)',
  'Mortar class as specified',
  'Bond, coursing and perpends',
  'Plumb and level',
  'Brickforce at the specified courses',
  'Wall ties at the specified spacing',
  'DPC laid and lapped',
  'Openings and lintels as per the drawings',
  'Movement joints as specified',
  'Face work clean'
], now()),
(gen_random_uuid()::text, 'Waterproofing', 'Waterproofing', 'QUALITY', ARRAY[
  'Substrate clean, dry and primed',
  'Falls to outlets',
  'Membrane as specified (product approved)',
  'Laps and upstands as specified',
  'Detailing at outlets, penetrations and corners',
  'Flood test passed',
  'Protection layer installed'
], now()),
(gen_random_uuid()::text, 'Roofing', 'Roofing', 'QUALITY', ARRAY[
  'Roof structure as per the engineer''s design',
  'Bracing and tie-downs',
  'Underlay and laps',
  'Sheeting or tiles as specified, fixed to the manufacturer''s instructions',
  'Flashings and valleys',
  'Gutters and downpipes, with falls',
  'Insulation to SANS 10400-XA'
], now()),
(gen_random_uuid()::text, 'Architect''s site inspection', 'General', 'DESIGN_SUPERVISION', ARRAY[
  'Works conform to the construction drawings',
  'Materials as specified',
  'Workmanship acceptable',
  'Setting out and levels',
  'Outstanding RFIs and instructions noted',
  'Health and safety observations passed to the PM'
], now()),
(gen_random_uuid()::text, 'Practical completion walk-through', 'Handover', 'PRACTICAL_COMPLETION', ARRAY[
  'Works complete to the contract documents',
  'Finishes complete and clean',
  'Doors, windows and ironmongery working',
  'Sanitary fittings and plumbing working',
  'Electrical installation complete, with certificate of compliance',
  'Fire installations complete, with certificates',
  'Roof and gutters watertight',
  'External works and landscaping complete',
  'Site cleared of rubble and temporary works'
], now());
