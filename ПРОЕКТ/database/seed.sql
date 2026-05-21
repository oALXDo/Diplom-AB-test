-- Тестовые данные для проверки работы системы.
-- Выполняю после database/schema.sql при пересоздании базы.

INSERT INTO accounts (email, password_hash)
VALUES ('admin@example.com', 'demo_hash_not_for_production')
ON CONFLICT (email) DO NOTHING;

INSERT INTO applications (name, description)
SELECT
    'Тестовое Приложение',
    'Приложения с витриной магазина, в которой меняются различные параметры'
WHERE NOT EXISTS (
    SELECT 1
    FROM applications app
    WHERE app.name = 'Тестовое Приложение'
);

UPDATE applications
SET icon_url = NULL
WHERE name = 'Тестовое Приложение';

INSERT INTO application_accounts (application_id, account_id)
SELECT app.application_id, a.account_id
FROM applications app
JOIN accounts a ON a.email = 'admin@example.com'
WHERE app.name = 'Тестовое Приложение'
ON CONFLICT (application_id, account_id) DO NOTHING;

INSERT INTO parameters (
    application_id,
    parameter_key,
    parameter_name,
    parameter_type,
    description,
    value_string
)
SELECT app.application_id, 'background_color', 'Цвет на заднем плане', 'string', 'Цвет фона интерфейса магазина.', '#F0F4F8'
FROM applications app
WHERE app.name = 'Тестовое Приложение'
ON CONFLICT (application_id, parameter_key) DO UPDATE
SET parameter_name = EXCLUDED.parameter_name,
    parameter_type = EXCLUDED.parameter_type,
    description = EXCLUDED.description,
    value_int = NULL,
    value_float = NULL,
    value_bool = NULL,
    value_string = EXCLUDED.value_string;

INSERT INTO parameters (
    application_id,
    parameter_key,
    parameter_name,
    parameter_type,
    description,
    value_bool
)
SELECT app.application_id, 'offer_1_show', 'Показывать предложение 1', 'bool', 'Управляет отображением первого предложения в магазине.', TRUE
FROM applications app
WHERE app.name = 'Тестовое Приложение'
ON CONFLICT (application_id, parameter_key) DO UPDATE
SET parameter_name = EXCLUDED.parameter_name,
    parameter_type = EXCLUDED.parameter_type,
    description = EXCLUDED.description,
    value_int = NULL,
    value_float = NULL,
    value_bool = EXCLUDED.value_bool,
    value_string = NULL;

INSERT INTO parameters (
    application_id,
    parameter_key,
    parameter_name,
    parameter_type,
    description,
    value_float
)
SELECT app.application_id, 'item_2_price', 'Стоимость Предмета 2', 'float', 'Цена второго предмета в магазине.', 60.700000
FROM applications app
WHERE app.name = 'Тестовое Приложение'
ON CONFLICT (application_id, parameter_key) DO UPDATE
SET parameter_name = EXCLUDED.parameter_name,
    parameter_type = EXCLUDED.parameter_type,
    description = EXCLUDED.description,
    value_int = NULL,
    value_float = EXCLUDED.value_float,
    value_bool = NULL,
    value_string = NULL;

INSERT INTO parameters (
    application_id,
    parameter_key,
    parameter_name,
    parameter_type,
    description,
    value_int
)
SELECT app.application_id, 'item_1_price', 'Стоимость Предмета 1', 'int', 'Цена первого предмета в магазине.', 20
FROM applications app
WHERE app.name = 'Тестовое Приложение'
ON CONFLICT (application_id, parameter_key) DO UPDATE
SET parameter_name = EXCLUDED.parameter_name,
    parameter_type = EXCLUDED.parameter_type,
    description = EXCLUDED.description,
    value_int = EXCLUDED.value_int,
    value_float = NULL,
    value_bool = NULL,
    value_string = NULL;

INSERT INTO parameters (
    application_id,
    parameter_key,
    parameter_name,
    parameter_type,
    description,
    value_string
)
SELECT app.application_id, 'item_2_name', 'Название Предмета 2', 'string', 'Название второго предмета в магазине.', 'Предмет 2'
FROM applications app
WHERE app.name = 'Тестовое Приложение'
ON CONFLICT (application_id, parameter_key) DO UPDATE
SET parameter_name = EXCLUDED.parameter_name,
    parameter_type = EXCLUDED.parameter_type,
    description = EXCLUDED.description,
    value_int = NULL,
    value_float = NULL,
    value_bool = NULL,
    value_string = EXCLUDED.value_string;

INSERT INTO parameters (
    application_id,
    parameter_key,
    parameter_name,
    parameter_type,
    description,
    value_string
)
SELECT app.application_id, 'item_1_name', 'Название Предмета 1', 'string', 'Название первого предмета в магазине.', 'Предмет 1'
FROM applications app
WHERE app.name = 'Тестовое Приложение'
ON CONFLICT (application_id, parameter_key) DO UPDATE
SET parameter_name = EXCLUDED.parameter_name,
    parameter_type = EXCLUDED.parameter_type,
    description = EXCLUDED.description,
    value_int = NULL,
    value_float = NULL,
    value_bool = NULL,
    value_string = EXCLUDED.value_string;

INSERT INTO experiments (application_id, name, description, status, started_at)
SELECT
    app.application_id,
    'Новые цены и интерфейс',
    'A/B-тест изменения цен, названий товаров, фона и отображения предложения.',
    'active',
    CURRENT_TIMESTAMP
FROM applications app
WHERE app.name = 'Тестовое Приложение'
  AND NOT EXISTS (
      SELECT 1
      FROM experiments e
      WHERE e.application_id = app.application_id
        AND e.name = 'Новые цены и интерфейс'
  );

INSERT INTO experiment_parameters (
    experiment_id,
    parameter_id,
    variant_a_value_string,
    variant_b_value_string
)
SELECT e.experiment_id, p.parameter_id, '#F0F4F8', '#0F172A'
FROM experiments e
JOIN parameters p ON p.application_id = e.application_id
WHERE e.name = 'Новые цены и интерфейс'
  AND p.parameter_key = 'background_color'
ON CONFLICT (experiment_id, parameter_id) DO UPDATE
SET variant_a_value_int = NULL,
    variant_a_value_float = NULL,
    variant_a_value_bool = NULL,
    variant_a_value_string = EXCLUDED.variant_a_value_string,
    variant_b_value_int = NULL,
    variant_b_value_float = NULL,
    variant_b_value_bool = NULL,
    variant_b_value_string = EXCLUDED.variant_b_value_string;

INSERT INTO experiment_parameters (
    experiment_id,
    parameter_id,
    variant_a_value_bool,
    variant_b_value_bool
)
SELECT e.experiment_id, p.parameter_id, FALSE, TRUE
FROM experiments e
JOIN parameters p ON p.application_id = e.application_id
WHERE e.name = 'Новые цены и интерфейс'
  AND p.parameter_key = 'offer_1_show'
ON CONFLICT (experiment_id, parameter_id) DO UPDATE
SET variant_a_value_int = NULL,
    variant_a_value_float = NULL,
    variant_a_value_bool = EXCLUDED.variant_a_value_bool,
    variant_a_value_string = NULL,
    variant_b_value_int = NULL,
    variant_b_value_float = NULL,
    variant_b_value_bool = EXCLUDED.variant_b_value_bool,
    variant_b_value_string = NULL;

INSERT INTO experiment_parameters (
    experiment_id,
    parameter_id,
    variant_a_value_string,
    variant_b_value_string
)
SELECT e.experiment_id, p.parameter_id, 'Предмет 1', 'Товар 1'
FROM experiments e
JOIN parameters p ON p.application_id = e.application_id
WHERE e.name = 'Новые цены и интерфейс'
  AND p.parameter_key = 'item_1_name'
ON CONFLICT (experiment_id, parameter_id) DO UPDATE
SET variant_a_value_int = NULL,
    variant_a_value_float = NULL,
    variant_a_value_bool = NULL,
    variant_a_value_string = EXCLUDED.variant_a_value_string,
    variant_b_value_int = NULL,
    variant_b_value_float = NULL,
    variant_b_value_bool = NULL,
    variant_b_value_string = EXCLUDED.variant_b_value_string;

INSERT INTO experiment_parameters (
    experiment_id,
    parameter_id,
    variant_a_value_string,
    variant_b_value_string
)
SELECT e.experiment_id, p.parameter_id, 'Предмет 2', 'Товар 2'
FROM experiments e
JOIN parameters p ON p.application_id = e.application_id
WHERE e.name = 'Новые цены и интерфейс'
  AND p.parameter_key = 'item_2_name'
ON CONFLICT (experiment_id, parameter_id) DO UPDATE
SET variant_a_value_int = NULL,
    variant_a_value_float = NULL,
    variant_a_value_bool = NULL,
    variant_a_value_string = EXCLUDED.variant_a_value_string,
    variant_b_value_int = NULL,
    variant_b_value_float = NULL,
    variant_b_value_bool = NULL,
    variant_b_value_string = EXCLUDED.variant_b_value_string;

INSERT INTO experiment_parameters (
    experiment_id,
    parameter_id,
    variant_a_value_int,
    variant_b_value_int
)
SELECT e.experiment_id, p.parameter_id, 20, 33
FROM experiments e
JOIN parameters p ON p.application_id = e.application_id
WHERE e.name = 'Новые цены и интерфейс'
  AND p.parameter_key = 'item_1_price'
ON CONFLICT (experiment_id, parameter_id) DO UPDATE
SET variant_a_value_int = EXCLUDED.variant_a_value_int,
    variant_a_value_float = NULL,
    variant_a_value_bool = NULL,
    variant_a_value_string = NULL,
    variant_b_value_int = EXCLUDED.variant_b_value_int,
    variant_b_value_float = NULL,
    variant_b_value_bool = NULL,
    variant_b_value_string = NULL;

INSERT INTO experiment_parameters (
    experiment_id,
    parameter_id,
    variant_a_value_float,
    variant_b_value_float
)
SELECT e.experiment_id, p.parameter_id, 60.700000, 88.500000
FROM experiments e
JOIN parameters p ON p.application_id = e.application_id
WHERE e.name = 'Новые цены и интерфейс'
  AND p.parameter_key = 'item_2_price'
ON CONFLICT (experiment_id, parameter_id) DO UPDATE
SET variant_a_value_int = NULL,
    variant_a_value_float = EXCLUDED.variant_a_value_float,
    variant_a_value_bool = NULL,
    variant_a_value_string = NULL,
    variant_b_value_int = NULL,
    variant_b_value_float = EXCLUDED.variant_b_value_float,
    variant_b_value_bool = NULL,
    variant_b_value_string = NULL;
