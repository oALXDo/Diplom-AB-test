const db = require('../db');

function hashUserId(userId) {
  // Простой стабильный hash: одинаковый user_id всегда попадёт в один вариант.
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function chooseVariant(userId) {
  return hashUserId(userId) % 2 === 0 ? 'A' : 'B';
}

function valueFromRow(row, prefix = 'value') {
  const intValue = row[`${prefix}_int`];
  const floatValue = row[`${prefix}_float`];
  const boolValue = row[`${prefix}_bool`];
  const stringValue = row[`${prefix}_string`];

  if (intValue !== null && intValue !== undefined) return Number(intValue);
  if (floatValue !== null && floatValue !== undefined) return Number(floatValue);
  if (boolValue !== null && boolValue !== undefined) return Boolean(boolValue);
  if (stringValue !== null && stringValue !== undefined) return stringValue;
  return null;
}

function buildTypedValueColumns(parameterType, rawValue, prefix = 'value') {
  const columns = {
    [`${prefix}_int`]: null,
    [`${prefix}_float`]: null,
    [`${prefix}_bool`]: null,
    [`${prefix}_string`]: null
  };

  if (parameterType === 'int') {
    const normalized = String(rawValue).trim().replace(',', '.');
    const parsed = Number(normalized);
    if (!Number.isInteger(parsed)) {
      const error = new Error('Значение типа int должно быть целым числом.');
      error.status = 400;
      throw error;
    }
    columns[`${prefix}_int`] = parsed;
  } else if (parameterType === 'float') {
    const parsed = Number(String(rawValue).trim().replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      const error = new Error('Значение типа float должно быть числом.');
      error.status = 400;
      throw error;
    }
    columns[`${prefix}_float`] = parsed;
  } else if (parameterType === 'bool') {
    columns[`${prefix}_bool`] = rawValue === true || rawValue === 'true' || rawValue === '1' || rawValue === 1;
  } else if (parameterType === 'string') {
    columns[`${prefix}_string`] = String(rawValue);
  } else {
    const error = new Error('Тип параметра должен быть одним из: int, float, bool, string.');
    error.status = 400;
    throw error;
  }

  return columns;
}

async function getClientParameter(applicationId, userId, parameterKey) {
  const parameterResult = await db.query(
    `SELECT *
     FROM parameters
     WHERE application_id = $1 AND parameter_key = $2`,
    [applicationId, parameterKey]
  );

  if (parameterResult.rowCount === 0) {
    return {
      found: false,
      use_fallback: true
    };
  }

  const parameter = parameterResult.rows[0];

  const experimentResult = await db.query(
    `SELECT *
     FROM experiments
     WHERE application_id = $1 AND status = 'active'
     LIMIT 1`,
    [applicationId]
  );

  if (experimentResult.rowCount > 0) {
    const experiment = experimentResult.rows[0];
    const experimentParameterResult = await db.query(
      `SELECT *
       FROM experiment_parameters
       WHERE experiment_id = $1 AND parameter_id = $2`,
      [experiment.experiment_id, parameter.parameter_id]
    );

    if (experimentParameterResult.rowCount > 0) {
      const assignment = await getOrCreateAssignment(experiment.experiment_id, userId);
      const experimentParameter = experimentParameterResult.rows[0];
      const prefix = assignment.variant_code === 'A' ? 'variant_a_value' : 'variant_b_value';

      return {
        found: true,
        parameter_key: parameter.parameter_key,
        parameter_type: parameter.parameter_type,
        parameter_value: valueFromRow(experimentParameter, prefix),
        source: 'ab_test',
        experiment_id: Number(experiment.experiment_id),
        variant_code: assignment.variant_code,
        use_fallback: false
      };
    }
  }

  return {
    found: true,
    parameter_key: parameter.parameter_key,
    parameter_type: parameter.parameter_type,
    parameter_value: valueFromRow(parameter),
    source: 'working_value',
    experiment_id: null,
    variant_code: null,
    use_fallback: false
  };
}

async function getOrCreateAssignment(experimentId, userId) {
  const existing = await db.query(
    `SELECT variant_code
     FROM user_variant_assignments
     WHERE experiment_id = $1 AND user_id = $2`,
    [experimentId, userId]
  );

  if (existing.rowCount > 0) {
    return existing.rows[0];
  }

  const variantCode = chooseVariant(userId);
  const created = await db.query(
    `INSERT INTO user_variant_assignments (experiment_id, user_id, variant_code)
     VALUES ($1, $2, $3)
     ON CONFLICT (experiment_id, user_id)
     DO UPDATE SET variant_code = user_variant_assignments.variant_code
     RETURNING variant_code`,
    [experimentId, userId, variantCode]
  );

  return created.rows[0];
}

async function finishExperiment(experimentId, winnerVariantCode) {
  if (!['A', 'B'].includes(winnerVariantCode)) {
    const error = new Error('Победитель должен быть вариантом A или B.');
    error.status = 400;
    throw error;
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const experimentResult = await client.query(
      `SELECT *
       FROM experiments
       WHERE experiment_id = $1
       FOR UPDATE`,
      [experimentId]
    );

    if (experimentResult.rowCount === 0) {
      const error = new Error('Эксперимент не найден.');
      error.status = 404;
      throw error;
    }

    const valuePrefix = winnerVariantCode === 'A' ? 'variant_a_value' : 'variant_b_value';
    const experimentParameters = await client.query(
      `SELECT ep.*, p.parameter_type
       FROM experiment_parameters ep
       JOIN parameters p ON p.parameter_id = ep.parameter_id
       WHERE ep.experiment_id = $1`,
      [experimentId]
    );

    for (const row of experimentParameters.rows) {
      await client.query(
        `UPDATE parameters
         SET value_int = $1,
             value_float = $2,
             value_bool = $3,
             value_string = $4
         WHERE parameter_id = $5`,
        [
          row[`${valuePrefix}_int`],
          row[`${valuePrefix}_float`],
          row[`${valuePrefix}_bool`],
          row[`${valuePrefix}_string`],
          row.parameter_id
        ]
      );
    }

    const updatedExperiment = await client.query(
      `UPDATE experiments
       SET status = 'finished',
           winner_variant_code = $2,
           finished_at = CURRENT_TIMESTAMP
       WHERE experiment_id = $1
       RETURNING *`,
      [experimentId, winnerVariantCode]
    );

    await client.query('COMMIT');
    return updatedExperiment.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  buildTypedValueColumns,
  chooseVariant,
  finishExperiment,
  getClientParameter,
  valueFromRow
};
