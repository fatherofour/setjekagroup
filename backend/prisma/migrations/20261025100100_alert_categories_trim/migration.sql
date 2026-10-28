-- App Review, 17 Oct 2026: Meetings and Site photos are no longer alert
-- categories. Drop them from anyone's saved alert settings.
UPDATE "User"
SET "mutedAlertCategories" = array_remove(array_remove("mutedAlertCategories", 'MEETINGS'), 'SITE')
WHERE "mutedAlertCategories" && ARRAY['MEETINGS', 'SITE'];
