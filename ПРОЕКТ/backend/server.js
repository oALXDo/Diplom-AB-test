const path = require('path');
const express = require('express');
const cors = require('cors');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const applicationsRouter = require('./src/routes/applications');
const parametersRouter = require('./src/routes/parameters');
const experimentsRouter = require('./src/routes/experiments');
const clientApiRouter = require('./src/routes/clientApi');
const accountsRouter = require('./src/routes/accounts');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.use('/api', accountsRouter);
app.use('/api', applicationsRouter);
app.use('/api', parametersRouter);
app.use('/api', experimentsRouter);
app.use('/api', clientApiRouter);

// Админ-панель лежит отдельно от backend, но удобно раздаётся тем же Express-сервером.
app.use(express.static(path.join(__dirname, '..', 'admin_web')));

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Внутренняя ошибка сервера.'
  });
});

app.listen(port, () => {
  console.log(`Backend для A/B-тестирования запущен: http://localhost:${port}`);
});
