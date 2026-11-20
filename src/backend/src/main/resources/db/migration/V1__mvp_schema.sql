-- RailFlow MVP schema, migration 1 (docs/design/mvp-contract.md §3).
-- Executed by the `schema` profile only, on the authorised local development database,
-- while holding the same physical connection as the import named lock.
-- Every statement is idempotent: an existing unknown table is never altered or dropped.

CREATE TABLE IF NOT EXISTS schema_version (
    version    INT         NOT NULL,
    applied_at DATETIME(3) NOT NULL,
    PRIMARY KEY (version)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS dataset_version (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    version_name   VARCHAR(64)  NOT NULL,
    sha256         CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_url     TEXT         NOT NULL,
    feed_version   VARCHAR(32)  NOT NULL,
    coverage_start DATE         NOT NULL,
    coverage_end   DATE         NOT NULL,
    status         VARCHAR(16)  NOT NULL,
    created_at     DATETIME(3)  NOT NULL,
    activated_at   DATETIME(3)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_dataset_version_name (version_name),
    CONSTRAINT ck_dataset_version_status
        CHECK (status IN ('IMPORTING', 'VALIDATING', 'ACTIVE', 'FAILED'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS dataset_active (
    singleton_id TINYINT NOT NULL,
    dataset_id   BIGINT  NULL,
    PRIMARY KEY (singleton_id),
    CONSTRAINT ck_dataset_active_singleton CHECK (singleton_id = 1)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS dataset_import_run (
    id                BIGINT      NOT NULL AUTO_INCREMENT,
    dataset_id        BIGINT      NULL,
    requested_version VARCHAR(64) NOT NULL,
    status            VARCHAR(16) NOT NULL,
    started_at        DATETIME(3) NOT NULL,
    finished_at       DATETIME(3) NULL,
    elapsed_ms        BIGINT      NULL,
    error_code        VARCHAR(64) NULL,
    report_json       JSON        NULL,
    PRIMARY KEY (id),
    KEY idx_import_run_dataset (dataset_id, id),
    CONSTRAINT ck_import_run_status
        CHECK (status IN ('CHECKING', 'IMPORTING', 'VALIDATING', 'SUCCEEDED', 'NOOP', 'FAILED', 'INTERRUPTED'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS dataset_file (
    dataset_id         BIGINT       NOT NULL,
    file_name          VARCHAR(64)  NOT NULL,
    sha256             CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    header             TEXT         NOT NULL,
    source_rows        BIGINT       NOT NULL,
    imported_rows      BIGINT       NOT NULL,
    uncompressed_bytes BIGINT       NOT NULL,
    PRIMARY KEY (dataset_id, file_name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS gtfs_agency (
    dataset_id      BIGINT       NOT NULL,
    agency_id       VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    agency_name     VARCHAR(255) NOT NULL,
    agency_url      TEXT         NOT NULL,
    agency_timezone VARCHAR(64)  NOT NULL,
    PRIMARY KEY (dataset_id, agency_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS gtfs_feed_info (
    dataset_id          BIGINT       NOT NULL,
    row_no              INT          NOT NULL,
    feed_publisher_name VARCHAR(255) NOT NULL,
    feed_publisher_url  TEXT         NOT NULL,
    feed_lang           VARCHAR(32)  NOT NULL,
    feed_start_date     DATE         NOT NULL,
    feed_end_date       DATE         NOT NULL,
    feed_version        VARCHAR(32)  NOT NULL,
    PRIMARY KEY (dataset_id, row_no)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS gtfs_stop (
    dataset_id    BIGINT        NOT NULL,
    stop_id       VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    stop_name     VARCHAR(255)  NOT NULL,
    stop_lat      DECIMAL(10,7) NOT NULL,
    stop_lon      DECIMAL(10,7) NOT NULL,
    location_type INT           NOT NULL,
    PRIMARY KEY (dataset_id, stop_id),
    KEY idx_gtfs_stop_name (dataset_id, stop_name, stop_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS gtfs_route (
    dataset_id       BIGINT       NOT NULL,
    route_id         VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    agency_id        VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    route_short_name VARCHAR(255) NOT NULL,
    route_type       INT          NOT NULL,
    PRIMARY KEY (dataset_id, route_id),
    KEY idx_gtfs_route_agency (dataset_id, agency_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS gtfs_trip (
    dataset_id      BIGINT       NOT NULL,
    trip_id         VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    route_id        VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    service_id      VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    trip_short_name VARCHAR(255) NOT NULL,
    trip_headsign   VARCHAR(255) NOT NULL,
    shape_id        VARCHAR(128) COLLATE utf8mb4_bin NULL,
    PRIMARY KEY (dataset_id, trip_id),
    KEY idx_gtfs_trip_service (dataset_id, service_id, trip_id),
    KEY idx_gtfs_trip_shape (dataset_id, shape_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS gtfs_stop_time (
    dataset_id        BIGINT       NOT NULL,
    trip_id           VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    stop_sequence     INT          NOT NULL,
    stop_id           VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    arrival_time      VARCHAR(16)  NOT NULL,
    departure_time    VARCHAR(16)  NOT NULL,
    arrival_seconds   INT UNSIGNED NOT NULL,
    departure_seconds INT UNSIGNED NOT NULL,
    PRIMARY KEY (dataset_id, trip_id, stop_sequence),
    KEY idx_gtfs_stop_time_stop (dataset_id, stop_id, trip_id, stop_sequence)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS gtfs_calendar_date (
    dataset_id     BIGINT       NOT NULL,
    service_id     VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    service_date   DATE         NOT NULL,
    exception_type TINYINT      NOT NULL,
    PRIMARY KEY (dataset_id, service_id, service_date),
    KEY idx_gtfs_calendar_date_lookup (dataset_id, service_date, exception_type, service_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS gtfs_shape_point (
    dataset_id        BIGINT        NOT NULL,
    shape_id          VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    shape_pt_sequence INT           NOT NULL,
    shape_pt_lat      DECIMAL(10,7) NOT NULL,
    shape_pt_lon      DECIMAL(10,7) NOT NULL,
    PRIMARY KEY (dataset_id, shape_id, shape_pt_sequence)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE IF NOT EXISTS gtfs_translation (
    dataset_id  BIGINT       NOT NULL,
    row_no      INT          NOT NULL,
    table_name  VARCHAR(128) NOT NULL,
    field_name  VARCHAR(128) NOT NULL,
    language    VARCHAR(32)  NOT NULL,
    translation TEXT         NOT NULL,
    record_id   VARCHAR(128) NOT NULL,
    PRIMARY KEY (dataset_id, row_no)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

-- Migration bookkeeping and the singleton active pointer are registered by the schema command
-- itself, only after the structure has been verified against SchemaGuard (task 20261118-17).
-- An incompatible pre-existing table must not be reported as a successful migration.
