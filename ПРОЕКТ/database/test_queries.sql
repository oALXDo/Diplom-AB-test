-- Полезные запросы для проверки работы базы и API.

SELECT * FROM accounts;
SELECT * FROM applications;
SELECT application_id, account_id, name, icon_url FROM applications ORDER BY application_id;
SELECT * FROM parameters ORDER BY parameter_id;
SELECT * FROM experiments ORDER BY experiment_id;
SELECT * FROM experiment_parameters ORDER BY experiment_parameter_id;
SELECT * FROM user_variant_assignments ORDER BY assignment_id;

-- Запуск первого draft-эксперимента вручную, если нужно проверить SQL без backend.
UPDATE experiments
SET status = 'active',
    started_at = CURRENT_TIMESTAMP
WHERE experiment_id = 1
  AND status = 'draft';

-- Проверка ограничения: второй active-эксперимент для того же приложения не должен создаться.
-- UPDATE experiments SET status = 'active' WHERE experiment_id = 2;

-- Завершение эксперимента вручную для проверки ограничения winner_variant_code.
-- UPDATE experiments
-- SET status = 'finished',
--     winner_variant_code = 'B',
--     finished_at = CURRENT_TIMESTAMP
-- WHERE experiment_id = 1;
