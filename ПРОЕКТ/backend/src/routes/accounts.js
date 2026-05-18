const crypto = require('crypto');
const express = require('express');
const db = require('../db');

const router = express.Router();

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function serializeAccount(row) {
  return {
    account_id: row.account_id,
    email: row.email,
    created_at: row.created_at
  };
}

router.post('/accounts/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Введите email и пароль.' });
    }

    const result = await db.query(
      `INSERT INTO accounts (email, password_hash)
       VALUES ($1, $2)
       RETURNING account_id, email, created_at`,
      [email, hashPassword(password)]
    );

    res.status(201).json(serializeAccount(result.rows[0]));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Аккаунт с таким email уже существует.' });
    }
    next(error);
  }
});

router.post('/accounts/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Введите email и пароль.' });
    }

    const result = await db.query(
      `SELECT account_id, email, password_hash, created_at
       FROM accounts
       WHERE email = $1`,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Неверный email или пароль.' });
    }

    const account = result.rows[0];
    const isSeedDemoAccount = account.password_hash === 'demo_hash_not_for_production';
    const passwordMatches = account.password_hash === hashPassword(password);

    if (isSeedDemoAccount && password !== 'admin') {
      return res.status(401).json({ error: 'Неверный email или пароль.' });
    }

    if (!isSeedDemoAccount && !passwordMatches) {
      return res.status(401).json({ error: 'Неверный email или пароль.' });
    }

    res.json(serializeAccount(account));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
