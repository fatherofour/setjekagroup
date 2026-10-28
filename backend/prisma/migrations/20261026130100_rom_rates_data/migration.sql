-- Indicative 2026 rates per m2 (ZAR, gross floor area, excluding VAT,
-- professional fees and land) for the rough cost estimate. They are a
-- starting point only: Setjeka's QS replaces them on the Rough estimates
-- page, which is why every estimate records the rate it used.
INSERT INTO "RomRate" ("id", "buildingType", "label", "quality", "ratePerM2", "currency", "updatedAt")
SELECT gen_random_uuid()::text, t.code, t.label, q.quality,
       CASE q.quality WHEN 'ECONOMY' THEN t.economy WHEN 'STANDARD' THEN t.standard ELSE t.prestige END,
       'ZAR', now()
FROM (VALUES
  ('RESIDENTIAL_LOW_COST', 'Low-cost and affordable housing', 5200, 6500, 8000),
  ('RESIDENTIAL_APARTMENTS', 'Apartments (multi-storey)', 11500, 14500, 22000),
  ('RESIDENTIAL_HOUSE', 'Free-standing houses', 9000, 13000, 24000),
  ('OFFICE', 'Offices', 12000, 15500, 24000),
  ('RETAIL', 'Retail centres', 11000, 14500, 19000),
  ('INDUSTRIAL', 'Industrial and warehousing', 6500, 8200, 11000),
  ('HOTEL', 'Hotels', 18000, 25000, 38000),
  ('HEALTHCARE', 'Clinics and hospitals', 20000, 28000, 38000),
  ('EDUCATION', 'Schools', 10500, 13500, 17500),
  ('PARKING', 'Structured parking', 6000, 7500, 9500)
) AS t(code, label, economy, standard, prestige)
CROSS JOIN (VALUES ('ECONOMY'), ('STANDARD'), ('PRESTIGE')) AS q(quality)
ON CONFLICT ("buildingType", "quality") DO NOTHING;

INSERT INTO "RomRegionFactor" ("id", "region", "factor", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Gauteng', 1.00, now()),
  (gen_random_uuid()::text, 'Western Cape', 1.04, now()),
  (gen_random_uuid()::text, 'KwaZulu-Natal', 0.98, now()),
  (gen_random_uuid()::text, 'Eastern Cape', 0.95, now()),
  (gen_random_uuid()::text, 'Free State', 0.94, now()),
  (gen_random_uuid()::text, 'Mpumalanga', 0.96, now()),
  (gen_random_uuid()::text, 'Limpopo', 0.95, now()),
  (gen_random_uuid()::text, 'North West', 0.95, now()),
  (gen_random_uuid()::text, 'Northern Cape', 0.97, now())
ON CONFLICT ("region") DO NOTHING;
