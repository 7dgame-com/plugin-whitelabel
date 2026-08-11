CREATE TABLE IF NOT EXISTS `white_label_domain_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Sole authoritative identity selected from the main-frontend catalog and
  -- exposed by the API as `configKey`.
  `domain` VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  -- Main-frontend catalog description captured when the key is created.
  `display_name` VARCHAR(191) NOT NULL,
  -- Independent public white-label JSON. `name`, when present, is brand data.
  `config_json` JSON NOT NULL,
  `schema_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `revision` BIGINT UNSIGNED NOT NULL DEFAULT 1,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `updated_by` BIGINT UNSIGNED NOT NULL,
  `status_changed_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `status_changed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_domain_config_domain` (`domain`),
  KEY `idx_domain_config_enabled` (`is_enabled`),
  CONSTRAINT `chk_domain_config_schema_version` CHECK (`schema_version` > 0),
  CONSTRAINT `chk_domain_config_revision` CHECK (`revision` > 0),
  CONSTRAINT `chk_domain_config_enabled` CHECK (`is_enabled` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
