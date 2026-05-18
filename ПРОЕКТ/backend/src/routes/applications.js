const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/applications', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT *
       FROM applications
       ORDER BY application_id`
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post('/applications', async (req, res, next) => {
  try {
    const { account_id, name, description } = req.body;

    if (!account_id || !name) {
      return res.status(400).json({ error: 'Укажите аккаунт и название приложения.' });
    }

    const result = await db.query(
      `INSERT INTO applications (account_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [account_id, name, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/applications/:applicationId', async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Укажите название.' });
    }

    const result = await db.query(
      `UPDATE applications
       SET name = $2,
           description = $3
       WHERE application_id = $1
       RETURNING *`,
      [req.params.applicationId, name, description || null]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Приложение не найдено.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/applications/:applicationId', async (req, res, next) => {
  try {
    const result = await db.query(
      `DELETE FROM applications
       WHERE application_id = $1
       RETURNING *`,
      [req.params.applicationId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Приложение не найдено.' });
    }

    res.json({ deleted: true, application: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
