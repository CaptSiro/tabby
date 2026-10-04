-- Calendar widget (project/widgets/calendar)



CREATE TABLE IF NOT EXISTS calendar_event (
    `id_calendar_event` INT NOT NULL AUTO_INCREMENT,
    `label` VARCHAR(250) NOT NULL,
    -- local time of the client, the widget decides what is past, today and upcoming
    `datetime` DATETIME NOT NULL,
    -- done events are kept, they are shown in today and upcoming
    `is_done` TINYINT NOT NULL DEFAULT '0',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_calendar_event`),
    INDEX (`datetime`)
) ENGINE = InnoDB;
