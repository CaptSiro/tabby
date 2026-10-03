-- Finance widget (project/widgets/finance)
-- Requires framework/sql/001-init.sql to be executed first (core_setting is used for 'finance:rate_cache_cleared')



CREATE TABLE IF NOT EXISTS finance_category (
    `id_finance_category` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    -- nerd font icon class, e.g. nf-fa-house
    `icon` VARCHAR(64) NOT NULL,
    -- #rrggbb or #rrggbbaa
    `color` VARCHAR(9) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- soft delete, so old transactions keep their icon and color
    `deleted_at` DATETIME DEFAULT NULL,
    PRIMARY KEY (`id_finance_category`)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS finance_transaction (
    `id_finance_transaction` INT NOT NULL AUTO_INCREMENT,
    `id_finance_category` INT NOT NULL,
    -- the day the money was spent
    `date` DATE NOT NULL,
    -- in `currency`
    `amount` DECIMAL(14, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL,
    -- preferred currency at the time the record was created
    `base_currency` CHAR(3) NOT NULL,
    -- 1 `currency` = `rate` `base_currency`, fixed when the record is created
    `rate` DECIMAL(18, 8) NOT NULL,
    `note` VARCHAR(250) NOT NULL DEFAULT '',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_finance_transaction`),
    INDEX (`date`),
    FOREIGN KEY (`id_finance_category`) REFERENCES finance_category (`id_finance_category`)
) ENGINE = InnoDB;

-- Daily cache of exchange rates, cleared once a month (see project\Finance::clearRateCache)
CREATE TABLE IF NOT EXISTS finance_rate (
    `id_finance_rate` INT NOT NULL AUTO_INCREMENT,
    `from_currency` CHAR(3) NOT NULL,
    `to_currency` CHAR(3) NOT NULL,
    `date` DATE NOT NULL,
    -- 1 `from_currency` = `rate` `to_currency`
    `rate` DECIMAL(18, 8) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_finance_rate`),
    UNIQUE (`from_currency`, `to_currency`, `date`)
) ENGINE = InnoDB;
