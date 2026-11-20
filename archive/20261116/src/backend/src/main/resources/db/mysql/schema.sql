SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS accounts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_accounts_email (email),
    CONSTRAINT ck_accounts_role CHECK (role IN ('USER', 'ADMIN'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS stations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    name VARCHAR(50) NOT NULL,
    city VARCHAR(50) NOT NULL,
    pinyin VARCHAR(100) NULL,
    aliases VARCHAR(255) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE KEY uk_stations_code (code),
    UNIQUE KEY uk_stations_name (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS passengers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    id_no VARCHAR(30) NOT NULL,
    phone VARCHAR(30) NULL,
    type VARCHAR(20) NOT NULL DEFAULT '成人',
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_passengers_account_id_no (account_id, id_no),
    KEY idx_passengers_account (account_id),
    CONSTRAINT fk_passengers_account FOREIGN KEY (account_id) REFERENCES accounts (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS train_runs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    train_no VARCHAR(20) NOT NULL,
    from_station_id BIGINT NOT NULL,
    to_station_id BIGINT NOT NULL,
    travel_date DATE NOT NULL,
    depart_time TIMESTAMP NOT NULL,
    arrive_time TIMESTAMP NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    capacity INT NOT NULL,
    available_seats INT NOT NULL,
    locked_seats INT NOT NULL DEFAULT 0,
    confirmed_seats INT NOT NULL DEFAULT 0,
    sale_open BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_train_runs_no_date (train_no, travel_date),
    KEY idx_train_runs_route (from_station_id, to_station_id, travel_date),
    CONSTRAINT fk_train_runs_from FOREIGN KEY (from_station_id) REFERENCES stations (id),
    CONSTRAINT fk_train_runs_to FOREIGN KEY (to_station_id) REFERENCES stations (id),
    CONSTRAINT ck_train_runs_inventory CHECK (
        capacity >= 0 AND available_seats >= 0 AND locked_seats >= 0 AND confirmed_seats >= 0
    ),
    CONSTRAINT ck_train_runs_capacity CHECK (
        capacity = available_seats + locked_seats + confirmed_seats
    )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    passenger_id BIGINT NOT NULL,
    run_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    fee DECIMAL(10, 2) NULL,
    refund_amount DECIMAL(10, 2) NULL,
    expire_at TIMESTAMP NOT NULL,
    train_no VARCHAR(20) NOT NULL,
    from_station_name VARCHAR(50) NOT NULL,
    to_station_name VARCHAR(50) NOT NULL,
    depart_time TIMESTAMP NOT NULL,
    passenger_name VARCHAR(100) NOT NULL,
    seat_type VARCHAR(20) NOT NULL DEFAULT '二等座',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP NULL DEFAULT NULL,
    cancelled_at TIMESTAMP NULL DEFAULT NULL,
    expired_at TIMESTAMP NULL DEFAULT NULL,
    refunded_at TIMESTAMP NULL DEFAULT NULL,
    active_flag TINYINT GENERATED ALWAYS AS (
        CASE WHEN status IN ('PENDING', 'CONFIRMED') THEN 1 ELSE NULL END
    ) STORED,
    UNIQUE KEY uk_active_order (account_id, passenger_id, run_id, active_flag),
    KEY idx_orders_account_status (account_id, status),
    CONSTRAINT fk_orders_account FOREIGN KEY (account_id) REFERENCES accounts (id),
    CONSTRAINT fk_orders_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id),
    CONSTRAINT fk_orders_run FOREIGN KEY (run_id) REFERENCES train_runs (id),
    CONSTRAINT ck_orders_status CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REFUNDED')),
    CONSTRAINT ck_orders_price CHECK (price >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS operation_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NULL,
    actor_account_id BIGINT NULL,
    actor_name VARCHAR(100) NULL,
    action VARCHAR(30) NOT NULL,
    from_status VARCHAR(20) NULL,
    to_status VARCHAR(20) NULL,
    reason VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_logs_order (order_id),
    CONSTRAINT fk_logs_order FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT fk_logs_actor FOREIGN KEY (actor_account_id) REFERENCES accounts (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
