const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { uploadObject } = require('../services/yandexObjectStorage');

const router = express.Router();
const MAX_ICON_BYTES = 900 * 1024;
const ICON_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function parseIconDataUrl(imageDataUrl, fallbackContentType) {
  const match = String(imageDataUrl || '').match(/^data:([^;,]+);base64,(.+)$/);
  const contentType = match ? match[1] : fallbackContentType;
  const base64 = match ? match[2] : String(imageDataUrl || '');

  if (!ICON_TYPES[contentType]) {
    const error = new Error('icon must be PNG, JPEG or WEBP image');
    error.status = 400;
    throw error;
  }

  const body = Buffer.from(base64, 'base64');
  if (!body.length || body.length > MAX_ICON_BYTES) {
    const error = new Error('icon file is too large');
    error.status = 400;
    throw error;
  }

  return { body, contentType, extension: ICON_TYPES[contentType] };
}

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

router.post('/applications/:applicationId/icon', async (req, res, next) => {
  try {
    const { image_data_url, content_type } = req.body;

    if (!image_data_url) {
      return res.status(400).json({ error: 'icon image is required' });
    }

    const existing = await db.query(
      `SELECT application_id
       FROM applications
       WHERE application_id = $1`,
      [req.params.applicationId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: 'РџСЂРёР»РѕР¶РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ.' });
    }

    const icon = parseIconDataUrl(image_data_url, content_type);
    const objectKey = `app-icons/application-${req.params.applicationId}-${Date.now()}-${crypto.randomUUID()}.${icon.extension}`;
    const uploaded = await uploadObject({
      key: objectKey,
      body: icon.body,
      contentType: icon.contentType
    });

    const result = await db.query(
      `UPDATE applications
       SET icon_url = $2
       WHERE application_id = $1
       RETURNING *`,
      [req.params.applicationId, uploaded.url]
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/applications/:applicationId/icon', async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE applications
       SET icon_url = NULL
       WHERE application_id = $1
       RETURNING *`,
      [req.params.applicationId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'РџСЂРёР»РѕР¶РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ.' });
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
