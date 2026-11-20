DROP TABLE IF EXISTS operation_logs;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS train_runs;
DROP TABLE IF EXISTS passengers;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS stations;

CREATE TABLE IF NOT EXISTS accounts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_accounts_email UNIQUE (email),
    CONSTRAINT ck_accounts_role CHECK (role IN ('USER', 'ADMIN'))
);

CREATE TABLE IF NOT EXISTS stations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    name VARCHAR(50) NOT NULL,
    city VARCHAR(50) NOT NULL,
    pinyin VARCHAR(100),
    aliases VARCHAR(255),
    sort_order INT NOT NULL DEFAULT 0,
    CONSTRAINT uk_stations_code UNIQUE (code),
    CONSTRAINT uk_stations_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS passengers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    id_no VARCHAR(30) NOT NULL,
    phone VARCHAR(30),
    type VARCHAR(20) NOT NULL DEFAULT '成人',
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_passengers_account FOREIGN KEY (account_id) REFERENCES accounts (id),
    CONSTRAINT uk_passengers_account_id_no UNIQUE (account_id, id_no)
);

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
    CONSTRAINT uk_train_runs_no_date UNIQUE (train_no, travel_date),
    CONSTRAINT fk_train_runs_from FOREIGN KEY (from_station_id) REFERENCES stations (id),
    CONSTRAINT fk_train_runs_to FOREIGN KEY (to_station_id) REFERENCES stations (id),
    CONSTRAINT ck_train_runs_inventory CHECK (
        capacity >= 0 AND available_seats >= 0 AND locked_seats >= 0 AND confirmed_seats >= 0
    ),
    CONSTRAINT ck_train_runs_capacity CHECK (
        capacity = available_seats + locked_seats + confirmed_seats
    )
);

CREATE TABLE IF NOT EXISTS orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    passenger_id BIGINT NOT NULL,
    run_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    fee DECIMAL(10, 2),
    refund_amount DECIMAL(10, 2),
    expire_at TIMESTAMP NOT NULL,
    train_no VARCHAR(20) NOT NULL,
    from_station_name VARCHAR(50) NOT NULL,
    to_station_name VARCHAR(50) NOT NULL,
    depart_time TIMESTAMP NOT NULL,
    passenger_name VARCHAR(100) NOT NULL,
    seat_type VARCHAR(20) NOT NULL DEFAULT '二等座',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP NULL,
    cancelled_at TIMESTAMP NULL,
    expired_at TIMESTAMP NULL,
    refunded_at TIMESTAMP NULL,
    active_flag TINYINT GENERATED ALWAYS AS (
        CASE WHEN status IN ('PENDING', 'CONFIRMED') THEN 1 ELSE NULL END
    ),
    CONSTRAINT uk_active_order UNIQUE (account_id, passenger_id, run_id, active_flag),
    CONSTRAINT fk_orders_account FOREIGN KEY (account_id) REFERENCES accounts (id),
    CONSTRAINT fk_orders_passenger FOREIGN KEY (passenger_id) REFERENCES passengers (id),
    CONSTRAINT fk_orders_run FOREIGN KEY (run_id) REFERENCES train_runs (id),
    CONSTRAINT ck_orders_status CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REFUNDED')),
    CONSTRAINT ck_orders_price CHECK (price >= 0)
);

CREATE TABLE IF NOT EXISTS operation_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT,
    actor_account_id BIGINT,
    actor_name VARCHAR(100),
    action VARCHAR(30) NOT NULL,
    from_status VARCHAR(20),
    to_status VARCHAR(20),
    reason VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_logs_order FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT fk_logs_actor FOREIGN KEY (actor_account_id) REFERENCES accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_train_runs_route
    ON train_runs (from_station_id, to_station_id, travel_date);
CREATE INDEX IF NOT EXISTS idx_orders_account_status
    ON orders (account_id, status);
CREATE INDEX IF NOT EXISTS idx_logs_order
    ON operation_logs (order_id);
