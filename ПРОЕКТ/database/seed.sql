-- Тестовые данные для демонстрации MVP.
-- Пароль не используется в MVP-авторизации; hash оставлен как пример поля accounts.

INSERT INTO accounts (email, password_hash)
VALUES ('admin@example.com', 'demo_hash_not_for_production')
ON CONFLICT (email) DO NOTHING;

INSERT INTO applications (account_id, name, description)
SELECT account_id, 'Unity WebGL Demo', 'Демо-приложение для дипломного A/B-тестирования параметров.'
FROM accounts
WHERE email = 'admin@example.com'
  AND NOT EXISTS (
      SELECT 1
      FROM applications
      WHERE applications.account_id = accounts.account_id
        AND applications.name = 'Unity WebGL Demo'
  );

INSERT INTO parameters (
    application_id,
    parameter_key,
    parameter_name,
    parameter_type,
    description,
    value_float
)
SELECT application_id, 'reward_multiplier', 'Множитель награды', 'float', 'Влияет на размер игровой награды.', 1.500000
FROM applications
WHERE name = 'Unity WebGL Demo'
ON CONFLICT (application_id, parameter_key) DO NOTHING;

INSERT INTO parameters (
    application_id,
    parameter_key,
    parameter_name,
    parameter_type,
    description,
    value_int
)
SELECT application_id, 'start_coins', 'Стартовые монеты', 'int', 'Количество монет при первом запуске.', 100
FROM applications
WHERE name = 'Unity WebGL Demo'
ON CONFLICT (application_id, parameter_key) DO NOTHING;

INSERT INTO parameters (
    application_id,
    parameter_key,
    parameter_name,
    parameter_type,
    description,
    value_bool
)
SELECT application_id, 'show_tutorial', 'Показывать обучение', 'bool', 'Включает или выключает tutorial flow.', TRUE
FROM applications
WHERE name = 'Unity WebGL Demo'
ON CONFLICT (application_id, parameter_key) DO NOTHING;

INSERT INTO experiments (application_id, name, description, status)
SELECT application_id, 'Reward Multiplier Test', 'Проверка влияния множителя награды на поведение пользователя.', 'draft'
FROM applications
WHERE name = 'Unity WebGL Demo'
  AND NOT EXISTS (
      SELECT 1
      FROM experiments
      WHERE experiments.application_id = applications.application_id
        AND experiments.name = 'Reward Multiplier Test'
  );

INSERT INTO experiment_parameters (
    experiment_id,
    parameter_id,
    variant_a_value_float,
    variant_b_value_float
)
SELECT e.experiment_id, p.parameter_id, 1.200000, 2.000000
FROM experiments e
JOIN parameters p ON p.application_id = e.application_id
WHERE e.name = 'Reward Multiplier Test'
  AND p.parameter_key = 'reward_multiplier'
ON CONFLICT (experiment_id, parameter_id) DO NOTHING;
