-- Energeia's WAMP / MySQL schema.
-- Safe to import: this schema never drops a database, table, or saved record.
-- For a database that already uses the original energeia_db SQL file, run
-- migrate.sql once instead of re-importing that original destructive script.

CREATE DATABASE IF NOT EXISTS energeia_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE energeia_db;

CREATE TABLE IF NOT EXISTS Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ElectricityRates (
    rate_id INT AUTO_INCREMENT PRIMARY KEY,
    provider_name VARCHAR(150) NOT NULL,
    rate_per_kwh DECIMAL(10,4) NOT NULL,
    effective_date DATE NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Households (
    household_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    household_name VARCHAR(150) NOT NULL,
    address VARCHAR(255),
    rate_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_households_user FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_households_rate FOREIGN KEY (rate_id) REFERENCES ElectricityRates(rate_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_households_user (user_id),
    INDEX idx_households_rate (rate_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Appliances (
    appliance_id INT AUTO_INCREMENT PRIMARY KEY,
    household_id INT NOT NULL,
    appliance_name VARCHAR(150) NOT NULL,
    category VARCHAR(100),
    wattage DECIMAL(10,2) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_appliances_household FOREIGN KEY (household_id) REFERENCES Households(household_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_appliances_household (household_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS UsageSchedules (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    appliance_id INT NOT NULL,
    days_of_week VARCHAR(50) NOT NULL,
    hours_per_day DECIMAL(4,2) NOT NULL,
    start_time TIME,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_schedules_appliance FOREIGN KEY (appliance_id) REFERENCES Appliances(appliance_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_schedules_appliance (appliance_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS BillingRecords (
    bill_id INT AUTO_INCREMENT PRIMARY KEY,
    household_id INT NOT NULL,
    rate_id INT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_kwh DECIMAL(10,2),
    estimated_cost DECIMAL(10,2),
    actual_bill_amount DECIMAL(10,2),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_billing_household FOREIGN KEY (household_id) REFERENCES Households(household_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_billing_rate FOREIGN KEY (rate_id) REFERENCES ElectricityRates(rate_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_billing_household (household_id),
    INDEX idx_billing_rate (rate_id),
    INDEX idx_billing_period (period_start, period_end)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ConsumptionRecords (
    record_id INT AUTO_INCREMENT PRIMARY KEY,
    appliance_id INT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    estimated_kwh DECIMAL(10,2),
    calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_consumption_appliance FOREIGN KEY (appliance_id) REFERENCES Appliances(appliance_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_consumption_appliance (appliance_id),
    INDEX idx_consumption_period (period_start, period_end)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS WhatIfScenarios (
    scenario_id INT AUTO_INCREMENT PRIMARY KEY,
    household_id INT NOT NULL,
    scenario_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_scenarios_household FOREIGN KEY (household_id) REFERENCES Households(household_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_scenarios_household (household_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ScenarioAppliances (
    scenario_appliance_id INT AUTO_INCREMENT PRIMARY KEY,
    scenario_id INT NOT NULL,
    appliance_id INT NOT NULL,
    adjusted_hours_per_day DECIMAL(4,2),
    adjusted_quantity INT,
    CONSTRAINT fk_scenarioapp_scenario FOREIGN KEY (scenario_id) REFERENCES WhatIfScenarios(scenario_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_scenarioapp_appliance FOREIGN KEY (appliance_id) REFERENCES Appliances(appliance_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_scenarioapp_scenario (scenario_id),
    INDEX idx_scenarioapp_appliance (appliance_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Recommendations (
    recommendation_id INT AUTO_INCREMENT PRIMARY KEY,
    household_id INT NOT NULL,
    appliance_id INT NULL,
    message VARCHAR(500) NOT NULL,
    potential_savings_kwh DECIMAL(10,2),
    potential_savings_cost DECIMAL(10,2),
    generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_reco_household FOREIGN KEY (household_id) REFERENCES Households(household_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_reco_appliance FOREIGN KEY (appliance_id) REFERENCES Appliances(appliance_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_reco_household (household_id),
    INDEX idx_reco_appliance (appliance_id)
) ENGINE=InnoDB;

-- This is a deliberately unconfigured rate, not an assumed real electricity tariff.
INSERT INTO ElectricityRates (provider_name, rate_per_kwh, effective_date)
SELECT 'Set your provider', 0, CURRENT_DATE
WHERE NOT EXISTS (
    SELECT 1 FROM ElectricityRates WHERE provider_name = 'Set your provider'
);
