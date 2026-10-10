-- Background image sets (project/components/Backgrounds, project/controllers/BackgroundController.php)



CREATE TABLE IF NOT EXISTS background_set (
    `id_background_set` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_background_set`),
    UNIQUE (`name`)
) ENGINE = InnoDB;

-- An image can be in multiple sets
CREATE TABLE IF NOT EXISTS background_set_file (
    `id_background_set_file` INT NOT NULL AUTO_INCREMENT,
    `id_background_set` INT NOT NULL,
    -- core_fs_file, without a foreign key so the framework tables can still be dropped and recreated
    -- (framework/sql), memberships of deleted files are not counted
    `id_fs_file` INT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_background_set_file`),
    UNIQUE (`id_background_set`, `id_fs_file`),
    INDEX (`id_fs_file`),
    FOREIGN KEY (`id_background_set`) REFERENCES background_set (`id_background_set`) ON DELETE CASCADE
) ENGINE = InnoDB;
