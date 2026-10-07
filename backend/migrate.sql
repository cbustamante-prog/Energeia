-- Run exactly once on a database created with the original energeia_db SQL file.
-- Make a phpMyAdmin backup before applying database changes.
USE energeia_db;

ALTER TABLE Appliances
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- MySQL RESTRICT prevents cascading deletion of saved historical consumption.
-- A historical appliance is soft-archived by the application instead.
ALTER TABLE ConsumptionRecords
    DROP FOREIGN KEY fk_consumption_appliance,
    ADD CONSTRAINT fk_consumption_appliance
        FOREIGN KEY (appliance_id) REFERENCES Appliances(appliance_id)
        ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO ElectricityRates (provider_name, rate_per_kwh, effective_date)
SELECT 'Set your provider', 0, CURRENT_DATE
WHERE NOT EXISTS (
    SELECT 1 FROM ElectricityRates WHERE provider_name = 'Set your provider'
);
