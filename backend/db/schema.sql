CREATE TABLE IF NOT EXISTS `white_label_organization_config` (
  `organization_id` BIGINT UNSIGNED NOT NULL,
  `organization_name` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `organization_title` VARCHAR(255) NOT NULL,
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
  PRIMARY KEY (`organization_id`),
  KEY `idx_organization_config_enabled` (`is_enabled`),
  CONSTRAINT `chk_organization_config_schema_version` CHECK (`schema_version` > 0),
  CONSTRAINT `chk_organization_config_revision` CHECK (`revision` > 0),
  CONSTRAINT `chk_organization_config_enabled` CHECK (`is_enabled` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `white_label_domain_config` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `domain` VARCHAR(253) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `display_name` VARCHAR(191) NOT NULL,
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

CREATE TABLE IF NOT EXISTS `white_label_assignment` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `organization_id` BIGINT UNSIGNED NOT NULL,
  `domain_id` BIGINT UNSIGNED NOT NULL,
  `revision` BIGINT UNSIGNED NOT NULL DEFAULT 1,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `updated_by` BIGINT UNSIGNED NOT NULL,
  `status_changed_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `status_changed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_white_label_assignment_pair` (`organization_id`, `domain_id`),
  KEY `idx_white_label_assignment_domain` (`domain_id`),
  KEY `idx_white_label_assignment_enabled` (`is_enabled`),
  CONSTRAINT `fk_white_label_assignment_organization`
    FOREIGN KEY (`organization_id`) REFERENCES `white_label_organization_config` (`organization_id`)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `fk_white_label_assignment_domain`
    FOREIGN KEY (`domain_id`) REFERENCES `white_label_domain_config` (`id`)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT `chk_white_label_assignment_revision` CHECK (`revision` > 0),
  CONSTRAINT `chk_white_label_assignment_enabled` CHECK (`is_enabled` IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
