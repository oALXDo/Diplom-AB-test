const express = require('express');
const db = require('../db');
const { buildTypedValueColumns, valueFromRow } = require('../services/parameterService');

const router = express.Router();

function serializeParameter(row) {
  return {
    ...row,
    parameter_value: valueFromRow(row)
  };
}

router.get('/applications/:applicationId/parameters', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT *
       FROM parameters
       WHERE application_id = $1
       ORDER BY parameter_id`,
      [req.params.applicationId]
    );
    res.json(result.rows.map(serializeParameter));
  } catch (error) {
    next(error);
  }
});

router.post('/applications/:applicationId/parameters', async (req, res, next) => {
  try {
    const { parameter_key, parameter_name, parameter_type, description, parameter_value } = req.body;

    if (!parameter_key || !parameter_name || !parameter_type || parameter_value === undefined) {
      return res.status(400).json({
        error: 'Заполните ключ, название, тип и значение параметра.'
      });
    }

    const values = buildTypedValueColumns(parameter_type, parameter_value);
    const result = await db.query(
      `INSERT INTO parameters (
           application_id,
           parameter_key,
           parameter_name,
           parameter_type,
           description,
           value_int,
           value_float,
           value_bool,
           value_string
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.params.applicationId,
        parameter_key,
        parameter_name,
        parameter_type,
        description || null,
        values.value_int,
        values.value_float,
        values.value_bool,
        values.value_string
      ]
    );

    res.status(201).json(serializeParameter(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

router.put('/parameters/:parameterId', async (req, res, next) => {
  try {
    const { parameter_name, description, parameter_value } = req.body;

    if (parameter_value === undefined) {
      return res.status(400).json({ error: 'Укажите значение параметра.' });
    }

    const current = await db.query(
      `SELECT *
       FROM parameters
       WHERE parameter_id = $1`,
      [req.params.parameterId]
    );

    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Параметр не найден.' });
    }

    const parameter = current.rows[0];
    const values = buildTypedValueColumns(parameter.parameter_type, parameter_value);

    const result = await db.query(
      `UPDATE parameters
       SET parameter_name = COALESCE($2, parameter_name),
           description = $3,
           value_int = $4,
           value_float = $5,
           value_bool = $6,
           value_string = $7
       WHERE parameter_id = $1
       RETURNING *`,
      [
        req.params.parameterId,
        parameter_name || null,
        description === undefined ? parameter.description : description,
        values.value_int,
        values.value_float,
        values.value_bool,
        values.value_string
      ]
    );

    res.json(serializeParameter(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

router.delete('/parameters/:parameterId', async (req, res, next) => {
  try {
    const result = await db.query(
      `DELETE FROM parameters
       WHERE parameter_id = $1
       RETURNING *`,
      [req.params.parameterId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Параметр не найден.' });
    }

    res.json({ deleted: true, parameter: serializeParameter(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
