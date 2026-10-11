-- Finance widget: investing plan (funds, recorded investments, daily price quotes)
-- Requires 001-finance.sql, settings of the plan are stored in core_setting 'finance:invest' (see project\Finance)



CREATE TABLE IF NOT EXISTS finance_fund (
    `id_finance_fund` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    -- Yahoo Finance symbol, e.g. VWCE.DE (Xetra), VUAA.DE, O (NYSE)
    `symbol` VARCHAR(32) NOT NULL,
    -- target share of the invested money, relative to the other funds (does not have to sum up to 100)
    `weight` DECIMAL(6, 2) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- soft delete, so old investments keep their fund
    `deleted_at` DATETIME DEFAULT NULL,
    PRIMARY KEY (`id_finance_fund`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS finance_investment (
    `id_finance_investment` INT NOT NULL AUTO_INCREMENT,
    `id_finance_fund` INT NOT NULL,
    -- the day the money was invested
    `date` DATE NOT NULL,
    -- in `currency`, money that left the bank account
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_finance_investment`),
    INDEX (`date`),
    FOREIGN KEY (`id_finance_fund`) REFERENCES finance_fund (`id_finance_fund`)
) ENGINE = InnoDB;

-- Daily cache of fund prices, only quotes of today are kept (see project\FinanceInvest::clearQuotes)
CREATE TABLE IF NOT EXISTS finance_quote (
    `id_finance_quote` INT NOT NULL AUTO_INCREMENT,
    `symbol` VARCHAR(32) NOT NULL,
    `date` DATE NOT NULL,
    -- in `currency`
    `price` DECIMAL(18, 6) NOT NULL,
    -- highest price of the last 52 weeks, in `currency`
    `high` DECIMAL(18, 6) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_finance_quote`),
    UNIQUE (`symbol`, `date`)
) ENGINE = InnoDB;

-- Default funds, only when there are none yet
INSERT INTO finance_fund (`name`, `symbol`, `weight`)
SELECT * FROM (
    SELECT 'Vanguard FTSE All-World' AS `name`, 'VWCE.DE' AS `symbol`, 50 AS `weight`
    UNION ALL SELECT 'Vanguard S&P 500', 'VUAA.DE', 35
    UNION ALL SELECT 'Realty Income', 'O', 15
) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM finance_fund);
