const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/applications', async (req, res, next) => {
  try {
    const { account_id } = req.query;

    if (!account_id) {
      return res.status(400).json({ error: 'Укажите аккаунт.' });
    }

    const result = await db.query(
      `SELECT app.*
       FROM applications app
       JOIN application_accounts aa ON aa.application_id = app.application_id
       WHERE aa.account_id = $1
       ORDER BY app.application_id`,
      [account_id]
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
      `WITH created AS (
           INSERT INTO applications (name, description)
           VALUES ($2, $3)
           RETURNING *
       ),
       linked AS (
           INSERT INTO application_accounts (application_id, account_id)
           SELECT application_id, $1
           FROM created
           RETURNING application_id
       )
       SELECT created.*
       FROM created
       JOIN linked ON linked.application_id = created.application_id`,
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
