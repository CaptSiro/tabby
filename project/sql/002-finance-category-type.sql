-- Finance widget: categories are either expenses or income
-- Requires 001-finance.sql, existing categories become expense categories

ALTER TABLE finance_category
    ADD COLUMN `type` ENUM ('expense', 'income') NOT NULL DEFAULT 'expense' AFTER `color`;
