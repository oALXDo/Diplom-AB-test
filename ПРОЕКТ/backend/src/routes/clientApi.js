const express = require('express');
const { getClientParameter } = require('../services/parameterService');

const router = express.Router();

router.get('/parameter', async (req, res, next) => {
  try {
    const { application_id, user_id, parameter_key } = req.query;

    if (!application_id || !user_id || !parameter_key) {
      return res.status(400).json({
        error: 'Укажите приложение, пользователя и ключ параметра.'
      });
    }

    const result = await getClientParameter(application_id, user_id, parameter_key);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
