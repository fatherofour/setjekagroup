-- Transmittal, RFI, submittal and order numbers are counted per project, so
-- they are unique per project rather than across every project.
DROP INDEX "Transmittal_transmittalNumber_key";
CREATE UNIQUE INDEX "Transmittal_projectId_transmittalNumber_key" ON "Transmittal"("projectId", "transmittalNumber");
DROP INDEX "Rfi_rfiNumber_key";
CREATE UNIQUE INDEX "Rfi_projectId_rfiNumber_key" ON "Rfi"("projectId", "rfiNumber");
DROP INDEX "Submittal_submittalNumber_key";
CREATE UNIQUE INDEX "Submittal_projectId_submittalNumber_key" ON "Submittal"("projectId", "submittalNumber");
DROP INDEX "PurchaseOrder_poNumber_key";
CREATE UNIQUE INDEX "PurchaseOrder_projectId_poNumber_key" ON "PurchaseOrder"("projectId", "poNumber");
