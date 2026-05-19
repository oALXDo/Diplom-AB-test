-- Схема MVP информационной системы A/B-тестирования параметров Unity WebGL-приложений.
-- Выполняйте файл в PostgreSQL через pgAdmin Query Tool или psql.

DROP TABLE IF EXISTS user_variant_assignments CASCADE;
DROP TABLE IF EXISTS experiment_parameters CASCADE;
DROP TABLE IF EXISTS experiments CASCADE;
DROP TABLE IF EXISTS parameters CASCADE;
DROP TABLE IF EXISTS application_accounts CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;

CREATE TABLE accounts (
    account_id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE applications (
    application_id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE application_accounts (
    application_id BIGINT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    CONSTRAINT pk_application_accounts PRIMARY KEY(application_id, account_id)
);

CREATE TABLE parameters (
    parameter_id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
    parameter_key VARCHAR(100) NOT NULL,
    parameter_name VARCHAR(255) NOT NULL,
    parameter_type VARCHAR(20) NOT NULL,
    description TEXT,
    value_int INTEGER,
    value_float NUMERIC(18,6),
    value_bool BOOLEAN,
    value_string TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_parameters_application_key UNIQUE(application_id, parameter_key),
    CONSTRAINT chk_parameters_type CHECK (parameter_type IN ('int', 'float', 'bool', 'string')),
    -- Ровно одно рабочее значение должно быть заполнено.
    CONSTRAINT chk_parameters_single_value CHECK (
        ((value_int IS NOT NULL)::int +
         (value_float IS NOT NULL)::int +
         (value_bool IS NOT NULL)::int +
         (value_string IS NOT NULL)::int) = 1
    ),
    -- Тип параметра должен соответствовать заполненной колонке значения.
    CONSTRAINT chk_parameters_value_matches_type CHECK (
        (parameter_type = 'int' AND value_int IS NOT NULL) OR
        (parameter_type = 'float' AND value_float IS NOT NULL) OR
        (parameter_type = 'bool' AND value_bool IS NOT NULL) OR
        (parameter_type = 'string' AND value_string IS NOT NULL)
    )
);

CREATE TABLE experiments (
    experiment_id BIGSERIAL PRIMARY KEY,
    application_id BIGINT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    winner_variant_code CHAR(1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    CONSTRAINT chk_experiments_status CHECK (status IN ('draft', 'active', 'finished')),
    CONSTRAINT chk_experiments_winner CHECK (winner_variant_code IS NULL OR winner_variant_code IN ('A', 'B'))
);

-- Для одного приложения одновременно допускается только один активный эксперимент.
CREATE UNIQUE INDEX ux_experiments_one_active_per_application
    ON experiments(application_id)
    WHERE status = 'active';

CREATE TABLE experiment_parameters (
    experiment_parameter_id BIGSERIAL PRIMARY KEY,
    experiment_id BIGINT NOT NULL REFERENCES experiments(experiment_id) ON DELETE CASCADE,
    parameter_id BIGINT NOT NULL REFERENCES parameters(parameter_id) ON DELETE CASCADE,
    variant_a_value_int INTEGER,
    variant_a_value_float NUMERIC(18,6),
    variant_a_value_bool BOOLEAN,
    variant_a_value_string TEXT,
    variant_b_value_int INTEGER,
    variant_b_value_float NUMERIC(18,6),
    variant_b_value_bool BOOLEAN,
    variant_b_value_string TEXT,
    CONSTRAINT uq_experiment_parameters_pair UNIQUE(experiment_id, parameter_id),
    -- Для варианта A должно быть заполнено ровно одно значение.
    CONSTRAINT chk_experiment_parameters_variant_a_single_value CHECK (
        ((variant_a_value_int IS NOT NULL)::int +
         (variant_a_value_float IS NOT NULL)::int +
         (variant_a_value_bool IS NOT NULL)::int +
         (variant_a_value_string IS NOT NULL)::int) = 1
    ),
    -- Для варианта B должно быть заполнено ровно одно значение.
    CONSTRAINT chk_experiment_parameters_variant_b_single_value CHECK (
        ((variant_b_value_int IS NOT NULL)::int +
         (variant_b_value_float IS NOT NULL)::int +
         (variant_b_value_bool IS NOT NULL)::int +
         (variant_b_value_string IS NOT NULL)::int) = 1
    )
);

CREATE TABLE user_variant_assignments (
    assignment_id BIGSERIAL PRIMARY KEY,
    experiment_id BIGINT NOT NULL REFERENCES experiments(experiment_id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    variant_code CHAR(1) NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_variant_assignments_user UNIQUE(experiment_id, user_id),
    CONSTRAINT chk_user_variant_assignments_variant CHECK (variant_code IN ('A', 'B'))
);

CREATE INDEX ix_parameters_application_id ON parameters(application_id);
CREATE INDEX ix_experiments_application_id ON experiments(application_id);
CREATE INDEX ix_experiment_parameters_experiment_id ON experiment_parameters(experiment_id);
CREATE INDEX ix_user_variant_assignments_experiment_id ON user_variant_assignments(experiment_id);
CREATE INDEX ix_application_accounts_account_id ON application_accounts(account_id);
