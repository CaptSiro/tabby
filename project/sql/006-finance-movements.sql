-- Finance widget: investments can be edited, the widget lists the last updated movements (transactions and investments)
-- Requires 005-finance-invest.sql



ALTER TABLE finance_investment
    ADD COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `created_at`;

UPDATE finance_investment SET `updated_at` = `created_at`;

-- the widget orders the movements by the time of their last change
ALTER TABLE finance_transaction
    ADD INDEX (`updated_at`);

ALTER TABLE finance_investment
    ADD INDEX (`updated_at`);
