const express = require('express');
const db = require('../db');
const { buildTypedValueColumns, finishExperiment } = require('../services/parameterService');

const router = express.Router();

router.get('/applications/:applicationId/experiments', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT
           e.*,
           COALESCE(
             json_agg(
               json_build_object(
                 'experiment_parameter_id', ep.experiment_parameter_id,
                 'parameter_id', p.parameter_id,
                 'parameter_key', p.parameter_key,
                 'parameter_name', p.parameter_name,
                 'parameter_type', p.parameter_type,
                 'variant_a_value',
                   CASE p.parameter_type
                     WHEN 'int' THEN to_jsonb(ep.variant_a_value_int)
                     WHEN 'float' THEN to_jsonb(ep.variant_a_value_float)
                     WHEN 'bool' THEN to_jsonb(ep.variant_a_value_bool)
                     WHEN 'string' THEN to_jsonb(ep.variant_a_value_string)
                   END,
                 'variant_b_value',
                   CASE p.parameter_type
                     WHEN 'int' THEN to_jsonb(ep.variant_b_value_int)
                     WHEN 'float' THEN to_jsonb(ep.variant_b_value_float)
                     WHEN 'bool' THEN to_jsonb(ep.variant_b_value_bool)
                     WHEN 'string' THEN to_jsonb(ep.variant_b_value_string)
                   END
               )
               ORDER BY ep.experiment_parameter_id
             ) FILTER (WHERE ep.experiment_parameter_id IS NOT NULL),
             '[]'::json
           ) AS tested_parameters
       FROM experiments e
       LEFT JOIN experiment_parameters ep ON ep.experiment_id = e.experiment_id
       LEFT JOIN parameters p ON p.parameter_id = ep.parameter_id
       WHERE e.application_id = $1
       GROUP BY e.experiment_id
       ORDER BY e.experiment_id`,
      [req.params.applicationId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post('/applications/:applicationId/experiments', async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Укажите название.' });
    }

    const result = await db.query(
      `INSERT INTO experiments (application_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.applicationId, name, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post('/experiments/:experimentId/parameters', async (req, res, next) => {
  try {
    const { parameter_id, variant_a_value, variant_b_value } = req.body;

    if (!parameter_id || variant_a_value === undefined || variant_b_value === undefined) {
      return res.status(400).json({
        error: 'Укажите параметр и значения вариантов A и B.'
      });
    }

    const parameterResult = await db.query(
      `SELECT p.parameter_type
       FROM parameters p
       JOIN experiments e ON e.application_id = p.application_id
       WHERE p.parameter_id = $1
         AND e.experiment_id = $2`,
      [parameter_id, req.params.experimentId]
    );

    if (parameterResult.rowCount === 0) {
      return res.status(404).json({ error: 'Параметр не найден в выбранном приложении.' });
    }

    const parameterType = parameterResult.rows[0].parameter_type;
    const a = buildTypedValueColumns(parameterType, variant_a_value, 'variant_a_value');
    const b = buildTypedValueColumns(parameterType, variant_b_value, 'variant_b_value');

    const result = await db.query(
      `INSERT INTO experiment_parameters (
           experiment_id,
           parameter_id,
           variant_a_value_int,
           variant_a_value_float,
           variant_a_value_bool,
           variant_a_value_string,
           variant_b_value_int,
           variant_b_value_float,
           variant_b_value_bool,
           variant_b_value_string
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (experiment_id, parameter_id)
       DO UPDATE SET
           variant_a_value_int = EXCLUDED.variant_a_value_int,
           variant_a_value_float = EXCLUDED.variant_a_value_float,
           variant_a_value_bool = EXCLUDED.variant_a_value_bool,
           variant_a_value_string = EXCLUDED.variant_a_value_string,
           variant_b_value_int = EXCLUDED.variant_b_value_int,
           variant_b_value_float = EXCLUDED.variant_b_value_float,
           variant_b_value_bool = EXCLUDED.variant_b_value_bool,
           variant_b_value_string = EXCLUDED.variant_b_value_string
       RETURNING *`,
      [
        req.params.experimentId,
        parameter_id,
        a.variant_a_value_int,
        a.variant_a_value_float,
        a.variant_a_value_bool,
        a.variant_a_value_string,
        b.variant_b_value_int,
        b.variant_b_value_float,
        b.variant_b_value_bool,
        b.variant_b_value_string
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/experiments/:experimentId/parameters/:parameterId', async (req, res, next) => {
  try {
    const result = await db.query(
      `DELETE FROM experiment_parameters
       WHERE experiment_id = $1 AND parameter_id = $2
       RETURNING *`,
      [req.params.experimentId, req.params.parameterId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Параметр эксперимента не найден.' });
    }

    res.json({ deleted: true, experiment_parameter: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/experiments/:experimentId/start', async (req, res, next) => {
  try {
    const experiment = await db.query(
      `SELECT e.status,
              COUNT(ep.experiment_parameter_id)::int AS parameter_count
       FROM experiments e
       LEFT JOIN experiment_parameters ep ON ep.experiment_id = e.experiment_id
       WHERE e.experiment_id = $1
       GROUP BY e.experiment_id`,
      [req.params.experimentId]
    );

    if (experiment.rowCount === 0 || experiment.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Эксперимент не найден или уже не является черновиком.' });
    }

    if (experiment.rows[0].parameter_count === 0) {
      return res.status(400).json({ error: 'Добавьте в эксперимент хотя бы один параметр перед запуском.' });
    }

    const result = await db.query(
      `UPDATE experiments
       SET status = 'active',
           started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
       WHERE experiment_id = $1
         AND status = 'draft'
       RETURNING *`,
      [req.params.experimentId]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Эксперимент не найден или уже не является черновиком.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Для одного приложения может быть активен только один эксперимент.'
      });
    }
    next(error);
  }
});

router.post('/experiments/:experimentId/finish', async (req, res, next) => {
  try {
    const updated = await finishExperiment(req.params.experimentId, req.body.winner_variant_code);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete('/experiments/:experimentId', async (req, res, next) => {
  try {
    const result = await db.query(
      `DELETE FROM experiments
       WHERE experiment_id = $1
       RETURNING *`,
      [req.params.experimentId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Эксперимент не найден.' });
    }

    res.json({ deleted: true, experiment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
